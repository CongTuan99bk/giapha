import { randomBytes, randomUUID } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { Inject, Injectable } from "@nestjs/common";
import type { LoginId } from "@coinguon/schemas";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { AppError, conflict } from "../common/errors.js";
import { sha256 } from "../common/guards.js";
import { Database } from "../db/database.js";

/** Tham số Argon2id theo khuyến nghị OWASP (19 MiB, 2 vòng) */
export const ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const INVALID_MESSAGE = "Email/số điện thoại hoặc mật khẩu không đúng";

// Băm giả để đăng nhập email không tồn tại tốn thời gian như email có thật (chống dò tài khoản)
const DUMMY_HASH = hash("khong-phai-mat-khau-that", ARGON2);

export interface RegisterInput {
  name: string;
  password: string;
  email?: string | undefined;
  phone?: string | undefined;
}

export interface IssuedSession {
  token: string;
  csrf: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Email/số điện thoại đã có tài khoản chưa — báo lỗi theo đúng trường để giao diện hiện cạnh ô nhập. */
  async assertAvailable(db: Pick<Database["app"], "selectFrom">, id: { email?: string | undefined; phone?: string | undefined }) {
    if (id.email && (await db.selectFrom("users").select("id").where("email", "=", id.email).executeTakeFirst())) {
      throw conflict("EMAIL_TAKEN", "Email này đã được đăng ký", [{ path: "email", message: "Email này đã có tài khoản" }]);
    }
    if (id.phone && (await db.selectFrom("users").select("id").where("phone", "=", id.phone).executeTakeFirst())) {
      throw conflict("PHONE_TAKEN", "Số điện thoại này đã được đăng ký", [{ path: "phone", message: "Số điện thoại này đã có tài khoản" }]);
    }
  }

  /** Đăng ký bằng email hoặc số điện thoại (ít nhất một; schema ở controller đã kiểm tra). */
  async register(input: RegisterInput, userAgent?: string) {
    await this.assertAvailable(this.db.app, input);
    const id = randomUUID();
    await this.db.app
      .insertInto("users")
      .values({
        id,
        email: input.email ?? null,
        phone: input.phone ?? null,
        name: input.name,
        password_hash: await hash(input.password, ARGON2),
        updated_at: new Date(),
      })
      .execute();
    // TODO(FR-AUTH-01): xác minh email/số điện thoại (OTP) khi có SMTP/SMS
    const user = { id, email: input.email ?? null, phone: input.phone ?? null, name: input.name };
    return { user, session: await this.issueSession(id, userAgent) };
  }

  async login(loginId: LoginId, password: string, userAgent?: string) {
    let q = this.db.app
      .selectFrom("users")
      .select(["id", "email", "phone", "name", "password_hash", "failed_logins", "locked_until"])
      .where("deleted_at", "is", null);
    q = loginId.email ? q.where("email", "=", loginId.email) : q.where("phone", "=", loginId.phone!);
    const user = await q.executeTakeFirst();

    if (!user || !user.password_hash) {
      // Không có tài khoản, hoặc tài khoản do quản trị tạo chưa đặt mật khẩu: trả lời như sai mật khẩu
      await verify(await DUMMY_HASH, password);
      throw new AppError(401, "INVALID_CREDENTIALS", INVALID_MESSAGE);
    }
    if (user.locked_until && user.locked_until > new Date()) {
      throw new AppError(423, "ACCOUNT_LOCKED", `Đăng nhập sai nhiều lần, vui lòng thử lại sau ${LOCK_MINUTES} phút`);
    }
    if (!(await verify(user.password_hash, password))) {
      const failed = user.failed_logins + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.db.app
        .updateTable("users")
        .set({
          failed_logins: lock ? 0 : failed,
          locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
          updated_at: new Date(),
        })
        .where("id", "=", user.id)
        .execute();
      if (lock) {
        throw new AppError(423, "ACCOUNT_LOCKED", `Đăng nhập sai nhiều lần, vui lòng thử lại sau ${LOCK_MINUTES} phút`);
      }
      throw new AppError(401, "INVALID_CREDENTIALS", INVALID_MESSAGE);
    }
    if (user.failed_logins > 0 || user.locked_until) {
      await this.db.app
        .updateTable("users")
        .set({ failed_logins: 0, locked_until: null, updated_at: new Date() })
        .where("id", "=", user.id)
        .execute();
    }
    return { user: { id: user.id, email: user.email, phone: user.phone, name: user.name }, session: await this.issueSession(user.id, userAgent) };
  }

  async logout(sessionId: string): Promise<void> {
    await this.db.app.deleteFrom("sessions").where("id", "=", sessionId).execute();
  }

  /** Token ngẫu nhiên 256 bit gửi cho trình duyệt; DB chỉ lưu SHA-256 của token. */
  private async issueSession(userId: string, userAgent?: string): Promise<IssuedSession> {
    const token = randomBytes(32).toString("base64url");
    const csrf = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + this.config.SESSION_TTL_DAYS * 86_400_000);
    await this.db.app
      .insertInto("sessions")
      .values({ id: sha256(token), user_id: userId, expires_at: expiresAt, user_agent: userAgent?.slice(0, 300) ?? null })
      .execute();
    return { token, csrf, expiresAt };
  }
}
