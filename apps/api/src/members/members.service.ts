import { randomBytes, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { sql } from "kysely";
import { audit } from "../common/audit.js";
import { type ClanRole, type Membership, ROLE_RANK } from "../common/context.js";
import { AppError, conflict, forbidden, notFound, unprocessable } from "../common/errors.js";
import { sha256 } from "../common/guards.js";
import { Database, type Tx } from "../db/database.js";

export type GrantableRole = Exclude<ClanRole, "owner">;

/**
 * Quy tắc phân quyền (BR-CLAN-01):
 * - Chỉ cấp được vai trò THẤP HƠN vai trò của mình; riêng chủ sở hữu cấp được "quản trị".
 * - Chỉ sửa/xoá được thành viên có vai trò thấp hơn mình. Không ai sửa được chủ sở hữu, không tự đổi vai trò của mình.
 */
export function canGrant(actor: ClanRole, role: GrantableRole): boolean {
  return ROLE_RANK[role] < ROLE_RANK[actor];
}
export function canManage(actor: ClanRole, target: ClanRole): boolean {
  return ROLE_RANK[target] < ROLE_RANK[actor];
}

export interface CreateAccountInput {
  name: string;
  email?: string | undefined;
  phone?: string | undefined;
  role: GrantableRole;
  personId?: string | undefined;
}

export interface CreateInvitationInput {
  role: GrantableRole;
  email?: string | undefined;
  personId?: string | undefined;
  expiresInDays: number;
  maxUses: number;
}

type InvitationStatus = "active" | "expired" | "revoked" | "used";

function statusOf(i: { revoked_at: Date | null; expires_at: Date; use_count: number; max_uses: number }): InvitationStatus {
  if (i.revoked_at) return "revoked";
  if (i.use_count >= i.max_uses) return "used";
  if (i.expires_at.getTime() <= Date.now()) return "expired";
  return "active";
}

const STATUS_ERROR: Record<Exclude<InvitationStatus, "active">, [string, string]> = {
  expired: ["INVITE_EXPIRED", "Lời mời đã hết hạn. Hãy nhờ ban quản lý gửi lời mời mới."],
  revoked: ["INVITE_REVOKED", "Lời mời đã bị huỷ. Hãy nhờ ban quản lý gửi lời mời mới."],
  used: ["INVITE_USED", "Lời mời đã được dùng hết lượt. Hãy nhờ ban quản lý gửi lời mời mới."],
};

@Injectable()
export class MembersService {
  constructor(private readonly db: Database) {}

  // ───────────── Thành viên ─────────────

  async list(trx: Tx) {
    const rows = await trx
      .selectFrom("clan_members as m")
      .innerJoin("users as u", "u.id", "m.user_id")
      .leftJoin("persons as p", (j) => j.onRef("p.id", "=", "m.person_id").on("p.deleted_at", "is", null))
      .select(["m.id", "m.user_id", "m.role", "m.person_id", "m.created_at", "u.name", "u.email", "u.phone", "u.password_hash", "p.full_name as person_name"])
      .orderBy(sql`case m.role when 'owner' then 0 when 'admin' then 1 when 'editor' then 2 else 3 end`)
      .orderBy("u.name")
      .execute();
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      /** Tài khoản do quản trị tạo, người dùng chưa đặt mật khẩu lần đầu */
      passwordPending: r.password_hash === null,
      role: r.role,
      person: r.person_id && r.person_name ? { id: r.person_id, fullName: r.person_name } : null,
      joinedAt: r.created_at,
    }));
  }

  async update(trx: Tx, actor: Membership, memberId: string, input: { role?: GrantableRole | undefined; personId?: string | null | undefined }) {
    const target = await trx.selectFrom("clan_members").select(["id", "user_id", "role", "person_id"]).where("id", "=", memberId).executeTakeFirst();
    if (!target) throw notFound("Không tìm thấy thành viên");
    const isSelf = target.user_id === actor.userId;

    if (input.role !== undefined) {
      if (isSelf) throw forbidden("CANNOT_CHANGE_OWN_ROLE", "Không thể tự đổi vai trò của mình");
      if (!canManage(actor.role, target.role)) throw forbidden("ROLE_TOO_LOW", "Bạn không đổi được vai trò của người này");
      if (!canGrant(actor.role, input.role)) throw forbidden("ROLE_TOO_LOW", "Bạn không cấp được vai trò này");
    }
    if (input.personId !== undefined && !isSelf && !canManage(actor.role, target.role)) {
      throw forbidden("ROLE_TOO_LOW", "Bạn không sửa được thông tin của người này");
    }
    if (input.personId) await this.assertPersonLinkable(trx, input.personId, memberId);

    await trx
      .updateTable("clan_members")
      .set({
        ...(input.role !== undefined && { role: input.role }),
        ...(input.personId !== undefined && {
          person_id: input.personId,
          person_link_confirmed_at: input.personId ? new Date() : null,
        }),
      })
      .where("id", "=", memberId)
      .execute();
    await audit(trx, {
      clanId: actor.clanId,
      actorId: actor.userId,
      action: "member.update",
      entity: "clan_member",
      entityId: memberId,
      before: { role: target.role, personId: target.person_id },
      after: input,
    });
    return (await this.list(trx)).find((m) => m.id === memberId)!;
  }

  async remove(trx: Tx, actor: Membership, memberId: string) {
    const target = await trx.selectFrom("clan_members").select(["id", "user_id", "role"]).where("id", "=", memberId).executeTakeFirst();
    if (!target) throw notFound("Không tìm thấy thành viên");
    if (target.user_id === actor.userId) throw forbidden("CANNOT_REMOVE_SELF", "Không thể tự xoá mình khỏi dòng họ");
    if (!canManage(actor.role, target.role)) throw forbidden("ROLE_TOO_LOW", "Bạn không xoá được người này");
    await trx.deleteFrom("clan_members").where("id", "=", memberId).execute();
    // Người bị xoá đăng xuất khỏi dòng họ ngay ở request kế tiếp (TenantGuard kiểm tra membership mỗi request)
    await audit(trx, { clanId: actor.clanId, actorId: actor.userId, action: "member.remove", entity: "clan_member", entityId: memberId, before: target });
  }

  /** Kiểm tra quản trị được phép đặt lại mật khẩu cho thành viên này; ghi nhật ký. */
  async resetTarget(trx: Tx, actor: Membership, memberId: string) {
    const target = await trx.selectFrom("clan_members").select(["id", "user_id", "role"]).where("id", "=", memberId).executeTakeFirst();
    if (!target) throw notFound("Không tìm thấy thành viên");
    if (target.user_id === actor.userId) throw forbidden("USE_FORGOT_PASSWORD", "Hãy dùng chức năng Quên mật khẩu cho tài khoản của chính bạn");
    if (!canManage(actor.role, target.role)) throw forbidden("ROLE_TOO_LOW", "Bạn không đặt lại mật khẩu được cho người này");
    await audit(trx, { clanId: actor.clanId, actorId: actor.userId, action: "member.password_reset_link", entity: "clan_member", entityId: memberId });
    return { userId: target.user_id };
  }

  /** Một người trong phả chỉ gắn với một tài khoản */
  private async assertPersonLinkable(trx: Tx, personId: string, memberId: string | null) {
    const p = await trx.selectFrom("persons").select("id").where("id", "=", personId).where("deleted_at", "is", null).executeTakeFirst();
    if (!p) throw unprocessable("PERSON_NOT_FOUND", "Không tìm thấy người này trong phả");
    let q = trx.selectFrom("clan_members").select("id").where("person_id", "=", personId);
    if (memberId) q = q.where("id", "<>", memberId);
    if (await q.executeTakeFirst()) throw conflict("PERSON_ALREADY_LINKED", "Người này trong phả đã gắn với một tài khoản khác");
  }

  // ───────────── Lời mời ─────────────

  /** Tạo lời mời; trả về mã một lần (chỉ hiện lúc tạo, DB chỉ lưu sha256). */
  async createInvitation(trx: Tx, actor: Membership, input: CreateInvitationInput) {
    if (!canGrant(actor.role, input.role)) throw forbidden("ROLE_TOO_LOW", "Bạn không cấp được vai trò này qua lời mời");
    if (input.personId) await this.assertPersonLinkable(trx, input.personId, null);
    const token = randomBytes(18).toString("base64url");
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
    await trx
      .insertInto("invitations")
      .values({
        id,
        clan_id: actor.clanId,
        token_hash: sha256(token),
        role: input.role,
        email: input.email ?? null,
        person_id: input.personId ?? null,
        created_by: actor.userId,
        max_uses: input.maxUses,
        expires_at: expiresAt,
      })
      .execute();
    await audit(trx, {
      clanId: actor.clanId,
      actorId: actor.userId,
      action: "invitation.create",
      entity: "invitation",
      entityId: id,
      after: { ...input, email: input.email ? "(có)" : null },
    });
    const [created] = await this.listInvitations(trx, id);
    return { ...created!, token };
  }

  async listInvitations(trx: Tx, onlyId?: string) {
    let q = trx
      .selectFrom("invitations as i")
      .leftJoin("users as u", "u.id", "i.created_by")
      .leftJoin("persons as p", "p.id", "i.person_id")
      .select([
        "i.id",
        "i.role",
        "i.email",
        "i.max_uses",
        "i.use_count",
        "i.expires_at",
        "i.revoked_at",
        "i.created_at",
        "u.name as created_by_name",
        "p.full_name as person_name",
        "p.id as person_id",
      ])
      .orderBy("i.created_at", "desc");
    if (onlyId) q = q.where("i.id", "=", onlyId);
    else q = q.where("i.revoked_at", "is", null).where("i.expires_at", ">", new Date()).where(sql<boolean>`i.use_count < i.max_uses`);
    const rows = await q.execute();
    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      email: r.email,
      maxUses: r.max_uses,
      useCount: r.use_count,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      createdBy: r.created_by_name,
      person: r.person_id && r.person_name ? { id: r.person_id, fullName: r.person_name } : null,
      status: statusOf(r),
    }));
  }

  async revokeInvitation(trx: Tx, actor: Membership, id: string) {
    const res = await trx
      .updateTable("invitations")
      .set({ revoked_at: new Date() })
      .where("id", "=", id)
      .where("revoked_at", "is", null)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw notFound("Không tìm thấy lời mời");
    await audit(trx, { clanId: actor.clanId, actorId: actor.userId, action: "invitation.revoke", entity: "invitation", entityId: id });
  }

  /**
   * Tra lời mời theo mã khi người nhận CHƯA là thành viên (chưa có ngữ cảnh dòng họ).
   * Ngoại lệ có kiểm soát của ADR-009: dùng role nền tảng (BYPASSRLS) nhưng chỉ khớp đúng sha256 của mã.
   */
  private async findByToken(token: string) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
    return this.db.platform
      .selectFrom("invitations as i")
      .innerJoin("clans as c", "c.id", "i.clan_id")
      .leftJoin("users as u", "u.id", "i.created_by")
      .select([
        "i.id",
        "i.clan_id",
        "i.role",
        "i.email",
        "i.person_id",
        "i.max_uses",
        "i.use_count",
        "i.expires_at",
        "i.revoked_at",
        "c.name as clan_name",
        "c.surname",
        "c.deleted_at as clan_deleted_at",
        "u.name as inviter_name",
      ])
      .where("i.token_hash", "=", sha256(token))
      .executeTakeFirst();
  }

  /** Xem trước lời mời (công khai): đủ để người nhận biết mình được mời vào đâu, không lộ email. */
  async preview(token: string) {
    const inv = await this.findByToken(token);
    if (!inv || inv.clan_deleted_at) throw new AppError(404, "INVITE_NOT_FOUND", "Không tìm thấy lời mời. Kiểm tra lại đường link.");
    return {
      clanId: inv.clan_id,
      clanName: inv.clan_name,
      surname: inv.surname,
      role: inv.role,
      invitedBy: inv.inviter_name,
      expiresAt: inv.expires_at,
      forSpecificEmail: inv.email !== null,
      status: statusOf(inv),
    };
  }

  /** Nhận lời mời: thêm vào dòng họ với vai trò đã định. Đã là thành viên → trả về dòng họ, không tốn lượt. */
  async accept(token: string, user: { id: string; email: string | null }) {
    const inv = await this.findByToken(token);
    if (!inv || inv.clan_deleted_at) throw new AppError(404, "INVITE_NOT_FOUND", "Không tìm thấy lời mời. Kiểm tra lại đường link.");
    const status = statusOf(inv);
    if (status !== "active") {
      const [code, message] = STATUS_ERROR[status];
      throw new AppError(410, code, message);
    }
    if (inv.email && inv.email.toLowerCase() !== user.email?.toLowerCase()) {
      throw forbidden("INVITE_EMAIL_MISMATCH", "Lời mời này dành cho một email khác. Hãy đăng nhập đúng tài khoản được mời.");
    }

    return this.db.withClan({ clanId: inv.clan_id, userId: user.id }, async (trx) => {
      // Đã là thành viên (vd. quản trị tự mở link mời của mình): giữ nguyên vai trò, không tốn lượt
      const existing = await trx.selectFrom("clan_members").select(["id", "role"]).where("user_id", "=", user.id).where("clan_id", "=", inv.clan_id).executeTakeFirst();
      if (existing) return { clanId: inv.clan_id, alreadyMember: true, role: existing.role };

      // Trừ lượt có điều kiện để hai người bấm cùng lúc không vượt số lượt
      const used = await trx
        .updateTable("invitations")
        .set((eb) => ({ use_count: eb("use_count", "+", 1) }))
        .where("id", "=", inv.id)
        .where(sql<boolean>`use_count < max_uses`)
        .where("revoked_at", "is", null)
        .executeTakeFirst();
      if (Number(used.numUpdatedRows) === 0) throw new AppError(410, ...STATUS_ERROR.used);

      // Người trong phả đã gắn cho tài khoản khác (hoặc đã xoá) thì bỏ qua, không chặn việc tham gia
      let personId = inv.person_id;
      if (personId) {
        const taken = await trx.selectFrom("clan_members").select("id").where("person_id", "=", personId).executeTakeFirst();
        const alive = await trx.selectFrom("persons").select("id").where("id", "=", personId).where("deleted_at", "is", null).executeTakeFirst();
        if (taken || !alive) personId = null;
      }
      const memberId = randomUUID();
      await trx
        .insertInto("clan_members")
        .values({
          id: memberId,
          clan_id: inv.clan_id,
          user_id: user.id,
          role: inv.role,
          person_id: personId,
          person_link_confirmed_at: personId ? new Date() : null,
        })
        .execute();
      await audit(trx, {
        clanId: inv.clan_id,
        actorId: user.id,
        action: "member.join",
        entity: "clan_member",
        entityId: memberId,
        after: { role: inv.role, invitationId: inv.id },
      });
      await this.closeJoinRequest(trx, user.id, "approved", user.id);
      return { clanId: inv.clan_id, alreadyMember: false, role: inv.role };
    });
  }

  // ───────────── Tài khoản do quản trị tạo ─────────────

  /**
   * Quản trị tạo tài khoản mới cho người chưa có tài khoản và thêm ngay vào dòng họ.
   * Tài khoản chưa có mật khẩu: người dùng tự đặt qua link do quản trị gửi (controller tạo link sau khi commit).
   * KHÔNG gắn tài khoản đã có sẵn — nếu gắn được, quản trị sẽ tạo được link đặt lại mật khẩu cho tài khoản của người khác.
   */
  async createAccount(trx: Tx, actor: Membership, input: CreateAccountInput) {
    if (!canGrant(actor.role, input.role)) throw forbidden("ROLE_TOO_LOW", "Bạn không cấp được vai trò này");
    if (input.personId) await this.assertPersonLinkable(trx, input.personId, null);
    if (input.email && (await trx.selectFrom("users").select("id").where("email", "=", input.email).executeTakeFirst())) {
      throw conflict("EMAIL_TAKEN", "Email này đã có tài khoản", [
        { path: "email", message: "Email này đã có tài khoản — hãy gửi link mời cho người đó, hoặc duyệt yêu cầu tham gia của họ" },
      ]);
    }
    if (input.phone && (await trx.selectFrom("users").select("id").where("phone", "=", input.phone).executeTakeFirst())) {
      throw conflict("PHONE_TAKEN", "Số điện thoại này đã có tài khoản", [
        { path: "phone", message: "Số này đã có tài khoản — hãy gửi link mời cho người đó, hoặc duyệt yêu cầu tham gia của họ" },
      ]);
    }
    const userId = randomUUID();
    await trx
      .insertInto("users")
      .values({ id: userId, name: input.name, email: input.email ?? null, phone: input.phone ?? null, password_hash: null, updated_at: new Date() })
      .execute();
    const memberId = randomUUID();
    await trx
      .insertInto("clan_members")
      .values({
        id: memberId,
        clan_id: actor.clanId,
        user_id: userId,
        role: input.role,
        person_id: input.personId ?? null,
        person_link_confirmed_at: input.personId ? new Date() : null,
      })
      .execute();
    await audit(trx, {
      clanId: actor.clanId,
      actorId: actor.userId,
      action: "member.create_account",
      entity: "clan_member",
      entityId: memberId,
      after: { role: input.role, personId: input.personId ?? null, email: input.email ? "(có)" : null, phone: input.phone ? "(có)" : null },
    });
    const member = (await this.list(trx)).find((m) => m.id === memberId)!;
    return { member, userId };
  }

  // ───────────── Yêu cầu tham gia (tự đăng ký, chờ duyệt) ─────────────

  /** Người đã đăng nhập xin vào dòng họ (trx đặt ngữ cảnh dòng họ đó + người dùng). Gửi lại sau khi bị từ chối thì thành chờ duyệt lại. */
  async requestToJoin(trx: Tx, clanId: string, userId: string, message: string | null) {
    const member = await trx.selectFrom("clan_members").select("id").where("user_id", "=", userId).executeTakeFirst();
    if (member) throw conflict("ALREADY_MEMBER", "Bạn đã là thành viên của dòng họ này");
    const id = randomUUID();
    await trx
      .insertInto("join_requests")
      .values({ id, clan_id: clanId, user_id: userId, message })
      .onConflict((oc) =>
        oc.columns(["clan_id", "user_id"]).doUpdateSet({
          message,
          status: "pending",
          decided_by: null,
          decided_at: null,
          created_at: new Date(),
        }),
      )
      .execute();
    await audit(trx, { clanId, actorId: userId, action: "join_request.create", entity: "join_request", entityId: id });
    return (await this.myJoinRequest(trx, userId))!;
  }

  async myJoinRequest(trx: Tx, userId: string) {
    const r = await trx
      .selectFrom("join_requests")
      .select(["status", "message", "created_at", "decided_at"])
      .where("user_id", "=", userId)
      .executeTakeFirst();
    return r ? { status: r.status, message: r.message, createdAt: r.created_at, decidedAt: r.decided_at } : null;
  }

  async listJoinRequests(trx: Tx) {
    const rows = await trx
      .selectFrom("join_requests as j")
      .innerJoin("users as u", "u.id", "j.user_id")
      .select(["j.id", "j.message", "j.created_at", "u.name", "u.email", "u.phone"])
      .where("j.status", "=", "pending")
      .where("u.deleted_at", "is", null)
      .orderBy("j.created_at")
      .execute();
    return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, message: r.message, createdAt: r.created_at }));
  }

  private async pendingRequest(trx: Tx, id: string) {
    const r = await trx.selectFrom("join_requests").select(["id", "user_id", "status"]).where("id", "=", id).executeTakeFirst();
    if (!r) throw notFound("Không tìm thấy yêu cầu");
    if (r.status !== "pending") throw conflict("REQUEST_DECIDED", "Yêu cầu này đã được xử lý");
    return r;
  }

  async approveJoinRequest(trx: Tx, actor: Membership, id: string, input: { role: GrantableRole; personId?: string | undefined }) {
    if (!canGrant(actor.role, input.role)) throw forbidden("ROLE_TOO_LOW", "Bạn không cấp được vai trò này");
    const r = await this.pendingRequest(trx, id);
    if (input.personId) await this.assertPersonLinkable(trx, input.personId, null);
    const memberId = randomUUID();
    await trx
      .insertInto("clan_members")
      .values({
        id: memberId,
        clan_id: actor.clanId,
        user_id: r.user_id,
        role: input.role,
        person_id: input.personId ?? null,
        person_link_confirmed_at: input.personId ? new Date() : null,
      })
      .onConflict((oc) => oc.columns(["clan_id", "user_id"]).doNothing())
      .execute();
    await this.closeJoinRequest(trx, r.user_id, "approved", actor.userId);
    await audit(trx, { clanId: actor.clanId, actorId: actor.userId, action: "join_request.approve", entity: "join_request", entityId: id, after: input });
  }

  async rejectJoinRequest(trx: Tx, actor: Membership, id: string) {
    const r = await this.pendingRequest(trx, id);
    await this.closeJoinRequest(trx, r.user_id, "rejected", actor.userId);
    await audit(trx, { clanId: actor.clanId, actorId: actor.userId, action: "join_request.reject", entity: "join_request", entityId: id });
  }

  /** Đóng yêu cầu đang chờ của một người (khi được duyệt, bị từ chối, hoặc vào bằng link mời). */
  private async closeJoinRequest(trx: Tx, userId: string, status: "approved" | "rejected", decidedBy: string) {
    await trx
      .updateTable("join_requests")
      .set({ status, decided_by: decidedBy, decided_at: new Date() })
      .where("user_id", "=", userId)
      .where("status", "=", "pending")
      .execute();
  }
}
