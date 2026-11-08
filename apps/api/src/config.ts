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
  /** Thư mục lưu ảnh (ADR-015). Production: volume Docker được sao lưu hằng đêm. */
  MEDIA_DIR: z.string().default("data/media"),
  /** Dung lượng tối đa mỗi ảnh tải lên (MB) */
  MEDIA_MAX_MB: z.coerce.number().int().min(1).max(50).default(15),
  /**
   * Express "trust proxy": tin các bước chuyển tiếp trong mạng nội bộ (Docker, Next, Caddy) để lấy đúng IP người dùng
   * từ X-Forwarded-For. Xem https://expressjs.com/en/guide/behind-proxies.html
   */
  TRUST_PROXY: z.string().default("loopback, linklocal, uniquelocal"),
  /** Header chứa IP thật do proxy tin cậy gắn (vd. "cf-connecting-ip" khi chạy sau Cloudflare Tunnel). Trống = dùng req.ip */
  CLIENT_IP_HEADER: z.string().optional(),
  /** Giới hạn tần suất (chặn dò mật khẩu, spam). Chỉ tắt trong test. */
  RATE_LIMIT: z.enum(["on", "off"]).default("on"),
  /** Số kết nối tối đa tới Postgres của API (Postgres mặc định cho 100; chừa chỗ cho sao lưu, migration) */
  DB_POOL_MAX: z.coerce.number().int().min(2).max(200).default(20),
  /** Bộ nhớ đệm phả đồ / lịch giỗ / trang công khai (MB). 0 = tắt */
  CACHE_MAX_MB: z.coerce.number().int().min(0).max(4096).default(64),
  /** Thời hạn tối đa một kết quả trong bộ nhớ đệm (giây) — phòng khi dữ liệu bị sửa ngoài API */
  CACHE_TTL_SEC: z.coerce.number().int().min(1).default(600),
  /** Địa chỉ web công khai, vd. https://giapha.example.vn — dùng để dựng link trong email */
  PUBLIC_URL: z.string().url().optional(),
  /** Gửi email qua SMTP (Gmail: smtp.gmail.com, cổng 465, mật khẩu ứng dụng). Trống = chỉ ghi link vào log máy chủ */
  SMTP_URL: z.string().optional(),
  SMTP_FROM: z.string().default("Gia Phả Cội Nguồn <no-reply@localhost>"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Biến để trống (vd. PUBLIC_URL= trong file .env hoặc docker compose) coi như không đặt
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = envSchema.safeParse(cleaned);
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
