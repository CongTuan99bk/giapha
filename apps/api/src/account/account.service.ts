import { hash, verify } from "@node-rs/argon2";
import { emailSchema, phoneSchema } from "@coinguon/schemas";
import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { ARGON2 } from "../auth/auth.service.js";
import { audit } from "../common/audit.js";
import { type Membership, ROLE_RANK } from "../common/context.js";
import { conflict, forbidden, notFound, unprocessable } from "../common/errors.js";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { Database, type Tx } from "../db/database.js";
import { canManage } from "../members/members.service.js";

/** Ô trống / null = bỏ (xoá email hoặc số điện thoại); không gửi = giữ nguyên */
const clearable = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess((v) => (v === null || (typeof v === "string" && v.trim() === "") ? null : v), s.nullable().optional());

export const passwordSchema = z.string().min(8, { message: "Mật khẩu tối thiểu 8 ký tự" }).max(200, { message: "Mật khẩu tối đa 200 ký tự" });
const nameSchema = z.string().trim().min(1, { message: "Nhập họ và tên" }).max(120);

/** Tự sửa tài khoản. Đổi email / số điện thoại cần mật khẩu hiện tại (lỡ để máy mở, người khác không chiếm được tài khoản). */
export const selfAccountSchema = z
  .object({
    name: nameSchema.optional(),
    email: clearable(emailSchema),
    phone: clearable(phoneSchema),
    currentPassword: z.string().max(200).optional(),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { message: "Nhập mật khẩu hiện tại" }).max(200),
    newPassword: passwordSchema,
  })
  .strict();

/** Quản trị sửa tài khoản người có vai trò thấp hơn; `newPassword` đặt mật khẩu mới thay họ */
export const memberAccountSchema = z
  .object({
    name: nameSchema.optional(),
    email: clearable(emailSchema),
    phone: clearable(phoneSchema),
    newPassword: z.preprocess((v) => (v === null || v === "" ? undefined : v), passwordSchema.optional()),
  })
  .strict();

type LoginChange = { name?: string | undefined; email?: string | null | undefined; phone?: string | null | undefined };

@Injectable()
export class AccountService {
  constructor(
    private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async user(executor: Pick<Database["app"], "selectFrom">, userId: string) {
    const u = await executor
      .selectFrom("users")
      .select(["id", "name", "email", "phone", "password_hash"])
      .where("id", "=", userId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!u) throw notFound("Không tìm thấy tài khoản");
    return u;
  }

  /** Các trường thực sự đổi; kiểm tra còn ít nhất một cách đăng nhập và email/SĐT chưa ai dùng */
  private async diff(
    executor: Pick<Database["app"], "selectFrom">,
    u: { id: string; name: string; email: string | null; phone: string | null },
    input: LoginChange,
  ) {
    const next = {
      name: input.name ?? u.name,
      email: input.email === undefined ? u.email : input.email,
      phone: input.phone === undefined ? u.phone : input.phone,
    };
    if (!next.email && !next.phone) {
      throw unprocessable("LOGIN_ID_REQUIRED", "Cần giữ ít nhất email hoặc số điện thoại để đăng nhập", [
        { path: "phone", message: "Cần giữ ít nhất email hoặc số điện thoại" },
      ]);
    }
    if (next.email && next.email !== u.email) {
      const other = await executor.selectFrom("users").select("id").where("email", "=", next.email).where("id", "<>", u.id).executeTakeFirst();
      if (other) throw conflict("EMAIL_TAKEN", "Email này đã có tài khoản khác", [{ path: "email", message: "Email này đã có tài khoản khác" }]);
    }
    if (next.phone && next.phone !== u.phone) {
      const other = await executor.selectFrom("users").select("id").where("phone", "=", next.phone).where("id", "<>", u.id).executeTakeFirst();
      if (other)
        throw conflict("PHONE_TAKEN", "Số điện thoại này đã có tài khoản khác", [{ path: "phone", message: "Số điện thoại này đã có tài khoản khác" }]);
    }
    const changed = {
      ...(next.name !== u.name && { name: next.name }),
      ...(next.email !== u.email && { email: next.email }),
      ...(next.phone !== u.phone && { phone: next.phone }),
    };
    return { next, changed, loginChanged: "email" in changed || "phone" in changed };
  }

  // ───────────── Tự sửa ─────────────

  async updateSelf(userId: string, input: z.infer<typeof selfAccountSchema>) {
    const u = await this.user(this.db.app, userId);
    const { next, changed, loginChanged } = await this.diff(this.db.app, u, input);
    if (loginChanged) {
      if (!input.currentPassword) {
        throw unprocessable("CURRENT_PASSWORD_REQUIRED", "Nhập mật khẩu hiện tại để đổi email / số điện thoại", [
          { path: "currentPassword", message: "Nhập mật khẩu hiện tại để đổi email / số điện thoại" },
        ]);
      }
      await this.assertPassword(u.password_hash, input.currentPassword);
    }
    if (Object.keys(changed).length)
      await this.db.app
        .updateTable("users")
        .set({ ...changed, updated_at: new Date() })
        .where("id", "=", userId)
        .execute();
    return { id: u.id, name: next.name, email: next.email, phone: next.phone };
  }

  /** Đổi mật khẩu: các thiết bị khác bị đăng xuất, thiết bị đang dùng giữ đăng nhập */
  async changePassword(userId: string, sessionId: string, input: z.infer<typeof changePasswordSchema>) {
    const u = await this.user(this.db.app, userId);
    await this.assertPassword(u.password_hash, input.currentPassword);
    await this.db.app.transaction().execute(async (trx) => {
      await trx
        .updateTable("users")
        .set({ password_hash: await hash(input.newPassword, ARGON2), failed_logins: 0, locked_until: null, updated_at: new Date() })
        .where("id", "=", userId)
        .execute();
      await trx.deleteFrom("sessions").where("user_id", "=", userId).where("id", "<>", sessionId).execute();
      // link đặt lại mật khẩu cũ (nếu có) hết hiệu lực
      await trx.updateTable("password_resets").set({ used_at: new Date() }).where("user_id", "=", userId).where("used_at", "is", null).execute();
    });
  }

  private async assertPassword(stored: string | null, given: string) {
    if (!stored || !(await verify(stored, given))) {
      throw unprocessable("WRONG_PASSWORD", "Mật khẩu hiện tại không đúng", [{ path: "currentPassword", message: "Mật khẩu hiện tại không đúng" }]);
    }
  }

  // ───────────── Quản trị sửa tài khoản thành viên ─────────────

  async updateMember(trx: Tx, actor: Membership, memberId: string, input: z.infer<typeof memberAccountSchema>) {
    const target = await trx.selectFrom("clan_members").select(["id", "user_id", "role"]).where("id", "=", memberId).executeTakeFirst();
    if (!target) throw notFound("Không tìm thấy thành viên");
    if (target.user_id === actor.userId) throw forbidden("USE_OWN_ACCOUNT_PAGE", "Sửa tài khoản của chính bạn ở trang Tài khoản của tôi");
    if (!canManage(actor.role, target.role)) throw forbidden("ROLE_TOO_LOW", "Chỉ sửa được tài khoản của người có vai trò thấp hơn bạn");
    // Nhiều dòng họ: tài khoản còn thuộc dòng họ khác thì quản trị dòng họ này không được đổi (chống chiếm tài khoản)
    if (this.config.CLAN_MODE !== "single") {
      const other = await this.db.platform
        .selectFrom("clan_members")
        .select("id")
        .where("user_id", "=", target.user_id)
        .where("clan_id", "<>", actor.clanId)
        .executeTakeFirst();
      if (other) throw forbidden("USER_IN_OTHER_CLAN", "Tài khoản này còn thuộc dòng họ khác — người đó tự sửa ở trang Tài khoản của tôi");
    }
    const u = await this.user(trx, target.user_id);
    const { next, changed } = await this.diff(trx, u, input);
    const set = {
      ...changed,
      ...(input.newPassword && { password_hash: await hash(input.newPassword, ARGON2), failed_logins: 0, locked_until: null }),
    };
    if (Object.keys(set).length)
      await trx
        .updateTable("users")
        .set({ ...set, updated_at: new Date() })
        .where("id", "=", u.id)
        .execute();
    if (input.newPassword) {
      // mật khẩu do quản trị đặt: đăng xuất mọi thiết bị của người đó, link đặt mật khẩu cũ hết hiệu lực
      await trx.deleteFrom("sessions").where("user_id", "=", u.id).execute();
      await trx.updateTable("password_resets").set({ used_at: new Date() }).where("user_id", "=", u.id).where("used_at", "is", null).execute();
    }
    await audit(trx, {
      clanId: actor.clanId,
      actorId: actor.userId,
      action: "member.account.update",
      entity: "clan_member",
      entityId: memberId,
      before: { name: u.name, email: u.email, phone: u.phone },
      after: { ...changed, ...(input.newPassword && { password: "đặt mới" }) },
    });
    return { id: memberId, name: next.name, email: next.email, phone: next.phone, passwordSet: Boolean(input.newPassword), roleRank: ROLE_RANK[target.role] };
  }
}
