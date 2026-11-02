import { randomBytes, randomUUID } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { Inject, Injectable } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { AppError, conflict } from "../common/errors.js";
import { sha256 } from "../common/guards.js";
import { Database } from "../db/database.js";

/** Tham số Argon2id theo khuyến nghị OWASP (19 MiB, 2 vòng) */
export const ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

// Băm giả để đăng nhập email không tồn tại tốn thời gian như email có thật (chống dò tài khoản)
const DUMMY_HASH = hash("khong-phai-mat-khau-that", ARGON2);

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

  async register(input: { email: string; password: string; name: string }, userAgent?: string) {
    const exists = await this.db.app.selectFrom("users").select("id").where("email", "=", input.email).executeTakeFirst();
    if (exists) throw conflict("EMAIL_TAKEN", "Email này đã được đăng ký");
    const id = randomUUID();
    await this.db.app
      .insertInto("users")
      .values({
        id,
        email: input.email,
        name: input.name,
        password_hash: await hash(input.password, ARGON2),
        updated_at: new Date(),
      })
      .execute();
    // TODO(FR-AUTH-01): gửi mã OTP xác minh email (cần module email — MVP phần 2)
    return { user: { id, email: input.email, name: input.name }, session: await this.issueSession(id, userAgent) };
  }

  async login(email: string, password: string, userAgent?: string) {
    const user = await this.db.app
      .selectFrom("users")
      .select(["id", "email", "name", "password_hash", "failed_logins", "locked_until"])
      .where("email", "=", email)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    if (!user || !user.password_hash) {
      await verify(await DUMMY_HASH, password);
      throw new AppError(401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng");
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
      throw new AppError(401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng");
    }
    if (user.failed_logins > 0 || user.locked_until) {
      await this.db.app
        .updateTable("users")
        .set({ failed_logins: 0, locked_until: null, updated_at: new Date() })
        .where("id", "=", user.id)
        .execute();
    }
    return { user: { id: user.id, email: user.email, name: user.name }, session: await this.issueSession(user.id, userAgent) };
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
