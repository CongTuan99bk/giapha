import { z } from "zod";

/** Mã khách ngẫu nhiên trong cookie (BR-STAT-03): không chứa thông tin cá nhân. */
export const visitorIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10,32}$/);

const hostSchema = z
  .string()
  .toLowerCase()
  .max(253)
  .regex(/^[a-z0-9.-]+$/);

const pathSchema = z
  .string()
  .max(512)
  .startsWith("/")
  // không ghi query string (có thể chứa dữ liệu cá nhân) — chỉ đường dẫn
  .transform((p) => p.split("?")[0]!.split("#")[0]!);

/**
 * Tín hiệu hoạt động gửi 30 giây/lần khi tab hiển thị (BR-STAT-01), khoá ngắn để payload nhỏ.
 * POST /t/hb
 */
export const heartbeatSchema = z.object({
  h: hostSchema,
  v: visitorIdSchema,
  p: pathSchema,
  /** 1 = thành viên đã đăng nhập */
  m: z.union([z.literal(0), z.literal(1)]).default(0),
});
export type HeartbeatPayload = z.infer<typeof heartbeatSchema>;

/** Một lượt xem trang (BR-STAT-04). POST /t/pv */
export const pageViewSchema = heartbeatSchema.extend({
  /** Nguồn truy cập: chỉ giữ tên miền, ví dụ "facebook.com" */
  r: z
    .string()
    .max(512)
    .optional()
    .transform((r) => referrerHost(r)),
  /** id người trong cây nếu đang xem hồ sơ (FR-STAT-05) */
  pid: z.string().uuid().optional(),
});
export type PageViewPayload = z.infer<typeof pageViewSchema>;

export function referrerHost(referrer: string | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Nhận diện bot qua user-agent (BR-STAT-05) — không đếm lượt của bot.
 * Không chặn trình duyệt trong app Zalo/Facebook: rất nhiều người xem link gia phả từ đó.
 */
const BOT_PATTERN =
  /bot|crawl|spider|slurp|facebookexternalhit|bingpreview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|axios|go-http-client/i;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return BOT_PATTERN.test(userAgent);
}

export type DeviceType = "mobile" | "tablet" | "desktop";

export function deviceTypeOf(userAgent: string): DeviceType {
  if (/ipad|tablet/i.test(userAgent)) return "tablet";
  if (/mobi|iphone/i.test(userAgent)) return "mobile";
  // Android không có chữ "Mobile" là máy tính bảng
  if (/android/i.test(userAgent)) return "tablet";
  return "desktop";
}

/**
 * Ngày thống kê theo giờ Việt Nam (BR-STAT-04): "YYYY-MM-DD".
 * Không phụ thuộc múi giờ của máy chủ.
 */
export function statDateVN(at: Date = new Date()): string {
  const shifted = new Date(at.getTime() + 7 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export const dailyRangeSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((r) => r.from <= r.to, { message: "Ngày bắt đầu phải trước ngày kết thúc" })
  .refine((r) => (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000 <= 366, {
    message: "Tối đa 366 ngày mỗi lần xem",
  });

export interface LiveStats {
  online: number;
  guests: number;
  members: number;
  pages: Array<{ path: string; online: number }>;
  at: string;
}

export interface DailyStat {
  date: string;
  pageViews: number;
  uniqueVisitors: number;
  memberViews: number;
}
