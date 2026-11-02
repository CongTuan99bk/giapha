import { randomBytes, randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { Inject, Injectable } from "@nestjs/common";
import { AppError } from "../common/errors.js";
import { sha256 } from "../common/guards.js";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { Database } from "../db/database.js";
import { MailService } from "../mail/mail.service.js";
import { ARGON2 } from "./auth.service.js";

const EMAIL_TTL_MIN = 30;
const ADMIN_TTL_HOURS = 24;

/** Đường dẫn trang đặt lại mật khẩu (tuyệt đối nếu có PUBLIC_URL, nếu không thì tương đối) */
export const resetPath = (token: string) => `/dat-lai-mat-khau?ma=${token}`;

/**
 * Đặt lại mật khẩu (FR-AUTH-04):
 * - người dùng tự yêu cầu qua email (link 30 phút);
 * - quản trị dòng họ tạo link hộ thành viên (24 giờ) để gửi qua Zalo — hợp với người lớn tuổi không dùng email.
 * Link dùng một lần; đặt lại xong thì đăng xuất mọi thiết bị và mở khoá tài khoản.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly db: Database,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async issue(userId: string, ttlMs: number, createdBy: string | null) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + ttlMs);
    // Link cũ chưa dùng hết hiệu lực — chỉ link mới nhất dùng được
    await this.db.app.updateTable("password_resets").set({ used_at: new Date() }).where("user_id", "=", userId).where("used_at", "is", null).execute();
    await this.db.app
      .insertInto("password_resets")
      .values({ id: randomUUID(), user_id: userId, token_hash: sha256(token), expires_at: expiresAt, created_by: createdBy })
      .execute();
    return { token, expiresAt };
  }

  /** Luôn "thành công" với người gọi để không lộ email nào có tài khoản. */
  async requestByEmail(email: string): Promise<void> {
    const user = await this.db.app
      .selectFrom("users")
      .select(["id", "name", "email"])
      .where("email", "=", email)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!user) return;
    const { token } = await this.issue(user.id, EMAIL_TTL_MIN * 60_000, null);
    const link = `${this.config.PUBLIC_URL?.replace(/\/$/, "") ?? ""}${resetPath(token)}`;
    await this.mail.send({
      to: user.email,
      subject: "Đặt lại mật khẩu — Gia Phả Cội Nguồn",
      text: [
        `Chào ${user.name},`,
        "",
        "Có người (có thể là bạn) vừa yêu cầu đặt lại mật khẩu cho tài khoản này.",
        `Mở link sau trong vòng ${EMAIL_TTL_MIN} phút để đặt mật khẩu mới:`,
        link,
        "",
        "Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu cũ vẫn dùng bình thường.",
      ].join("\n"),
    });
  }

  /** Quản trị tạo link hộ một thành viên (đã kiểm tra quyền ở MembersService). */
  issueForMember(userId: string, adminId: string) {
    return this.issue(userId, ADMIN_TTL_HOURS * 3_600_000, adminId);
  }

  async reset(token: string, password: string): Promise<{ email: string }> {
    const row = await this.db.app
      .selectFrom("password_resets as r")
      .innerJoin("users as u", "u.id", "r.user_id")
      .select(["r.id", "r.user_id", "r.expires_at", "r.used_at", "u.email"])
      .where("r.token_hash", "=", sha256(token))
      .where("u.deleted_at", "is", null)
      .executeTakeFirst();
    if (!row || row.used_at || row.expires_at <= new Date()) {
      throw new AppError(410, "RESET_LINK_INVALID", "Link đặt lại mật khẩu đã hết hạn hoặc đã được dùng. Hãy yêu cầu link mới.");
    }
    const passwordHash = await hash(password, ARGON2);
    await this.db.app.transaction().execute(async (trx) => {
      // Đánh dấu đã dùng có điều kiện: hai lần bấm cùng lúc chỉ một lần thành công
      const used = await trx.updateTable("password_resets").set({ used_at: new Date() }).where("id", "=", row.id).where("used_at", "is", null).executeTakeFirst();
      if (Number(used.numUpdatedRows) === 0) {
        throw new AppError(410, "RESET_LINK_INVALID", "Link đặt lại mật khẩu đã hết hạn hoặc đã được dùng. Hãy yêu cầu link mới.");
      }
      await trx
        .updateTable("users")
        .set({ password_hash: passwordHash, failed_logins: 0, locked_until: null, updated_at: new Date() })
        .where("id", "=", row.user_id)
        .execute();
      await trx.deleteFrom("sessions").where("user_id", "=", row.user_id).execute(); // đăng xuất mọi thiết bị
    });
    return { email: row.email };
  }
}
