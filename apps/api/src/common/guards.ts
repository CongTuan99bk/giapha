import { createHash, timingSafeEqual } from "node:crypto";
import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Database } from "../db/database.js";
import { type AppRequest, type ClanRole, IS_PUBLIC, MIN_ROLE, ROLE_RANK } from "./context.js";
import { AppError, forbidden, notFound } from "./errors.js";

export const SESSION_COOKIE = "sid";
export const CSRF_COOKIE = "csrf";
export const CSRF_HEADER = "x-csrf-token";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Xác thực phiên từ cookie `sid` (HttpOnly) và chống CSRF kiểu double-submit:
 * request ghi phải gửi header `X-CSRF-Token` trùng cookie `csrf`.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: Database,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== "string" || token.length < 20) {
      throw new AppError(401, "UNAUTHENTICATED", "Vui lòng đăng nhập");
    }
    const row = await this.db.app
      .selectFrom("sessions as s")
      .innerJoin("users as u", "u.id", "s.user_id")
      .select(["s.id as sessionId", "u.id", "u.email", "u.name", "u.is_platform_admin"])
      .where("s.id", "=", sha256(token))
      .where("s.expires_at", ">", new Date())
      .where("u.deleted_at", "is", null)
      .executeTakeFirst();
    if (!row) throw new AppError(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn");

    if (!SAFE_METHODS.has(req.method)) {
      const cookie: unknown = req.cookies?.[CSRF_COOKIE];
      const header = req.header(CSRF_HEADER);
      if (typeof cookie !== "string" || !header || !safeEqual(cookie, header)) {
        throw forbidden("CSRF_INVALID", "Yêu cầu không hợp lệ, vui lòng tải lại trang");
      }
    }
    req.user = {
      id: row.id,
      email: row.email,
      name: row.name,
      isPlatformAdmin: row.is_platform_admin,
      sessionId: row.sessionId,
    };
    return true;
  }
}

/**
 * Với route có `:clanId`: kiểm tra người dùng là thành viên dòng họ và đủ vai trò (@MinRole).
 * Không phải thành viên → 404 (không tiết lộ dòng họ tồn tại).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: Database,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const clanId = req.params?.clanId;
    if (clanId === undefined) return true;
    if (!req.user) return true; // route public tự xử lý ngữ cảnh
    if (typeof clanId !== "string" || !UUID.test(clanId)) throw notFound("Không tìm thấy dòng họ");

    const userId = req.user.id;
    const m = await this.db.withClan({ clanId, userId }, (trx) =>
      trx
        .selectFrom("clan_members as m")
        .innerJoin("clans as c", "c.id", "m.clan_id")
        .select(["m.id", "m.role", "m.person_id", "c.locked_at"])
        .where("m.clan_id", "=", clanId)
        .where("m.user_id", "=", userId)
        .where("c.deleted_at", "is", null)
        .executeTakeFirst(),
    );
    if (!m) throw notFound("Không tìm thấy dòng họ");
    if (m.locked_at) throw new AppError(423, "CLAN_LOCKED", "Dòng họ đang tạm khoá");

    const min = this.reflector.getAllAndOverride<ClanRole>(MIN_ROLE, [ctx.getHandler(), ctx.getClass()]) ?? "member";
    if (ROLE_RANK[m.role] < ROLE_RANK[min]) throw forbidden();
    req.membership = { clanId, userId, memberId: m.id, role: m.role, personId: m.person_id };
    return true;
  }
}
