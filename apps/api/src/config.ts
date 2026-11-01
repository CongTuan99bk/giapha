import { z } from "zod";

const boolish = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  /** Role coinguon_app — bị Row-Level Security giới hạn theo dòng họ */
  APP_DATABASE_URL: z.string().url(),
  /** Role coinguon_platform — BYPASSRLS, chỉ cho tác vụ nền tảng */
  PLATFORM_DATABASE_URL: z.string().url(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  /** Cookie Secure (bắt buộc true ở production chạy HTTPS) */
  COOKIE_SECURE: boolish.default(false),
  /** Domain cookie để dùng chung giữa các subdomain, ví dụ ".coinguon.vn" */
  COOKIE_DOMAIN: z.string().optional(),
  /**
   * single: hệ thống dùng riêng cho MỘT dòng họ (quyết định 2026-11-01) — chỉ tạo được dòng họ đầu tiên.
   * multi: dịch vụ nhiều dòng họ (để sẵn, chưa dùng).
   */
  CLAN_MODE: z.enum(["single", "multi"]).default("single"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Cấu hình môi trường không hợp lệ — ${issues}`);
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.COOKIE_SECURE) {
    throw new Error("Production phải bật COOKIE_SECURE=true");
  }
  return parsed.data;
}

export const APP_CONFIG = Symbol("APP_CONFIG");
