import { z } from "zod";

export const idSchema = z.string().uuid({ message: "Mã không hợp lệ" });

/** Chuẩn hoá số điện thoại Việt Nam về dạng +84…; trả null nếu không hợp lệ. */
export function normalizeVnPhone(input: string): string | null {
  const cleaned = input.replace(/[\s.\-()]/g, "");
  const m = /^(?:\+84|84|0)(2\d{9}|[35789]\d{8})$/.exec(cleaned);
  return m ? `+84${m[1]}` : null;
}

export const vnPhoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const normalized = normalizeVnPhone(v);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Số điện thoại không hợp lệ" });
      return z.NEVER;
    }
    return normalized;
  });

export const emailSchema = z.string().trim().toLowerCase().email({ message: "Email không hợp lệ" }).max(254);

/** Số điện thoại đăng nhập: số Việt Nam (chuẩn hoá +84…) hoặc số quốc tế dạng +<mã nước><số>. */
export function normalizePhone(input: string): string | null {
  const vn = normalizeVnPhone(input);
  if (vn) return vn;
  const cleaned = input.replace(/[\s.\-()]/g, "");
  if (cleaned.startsWith("+84")) return null; // số +84 phải đúng định dạng Việt Nam
  return /^\+[1-9]\d{7,14}$/.test(cleaned) ? cleaned : null;
}

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Số điện thoại không hợp lệ" });
      return z.NEVER;
    }
    return normalized;
  });

export type LoginId = { email: string; phone?: undefined } | { phone: string; email?: undefined };

/** Nhận "email hoặc số điện thoại" người dùng gõ vào một ô; có "@" thì coi là email. */
export function parseLoginId(input: string): LoginId | null {
  const v = input.trim();
  if (v.includes("@")) {
    const r = emailSchema.safeParse(v);
    return r.success ? { email: r.data } : null;
  }
  const phone = normalizePhone(v);
  return phone ? { phone } : null;
}

export const loginIdSchema = z
  .string()
  .trim()
  .min(1, { message: "Nhập email hoặc số điện thoại" })
  .max(254)
  .transform((v, ctx) => {
    const id = parseLoginId(v);
    if (!id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: v.includes("@") ? "Email không hợp lệ" : "Số điện thoại không hợp lệ (ví dụ 0912 345 678)",
      });
      return z.NEVER;
    }
    return id;
  });

export const genderSchema = z.enum(["male", "female", "unknown"]);

/** Mức riêng tư của một người (BR-PRIV-01) */
export const privacySchema = z.enum(["public", "members", "hidden"]);

/**
 * Ngày tháng linh hoạt cho dữ liệu gia phả: dương hoặc âm lịch, độ chính xác tới ngày/tháng/năm
 * hoặc "khoảng", kèm nguyên văn người nhập (ví dụ "khoảng năm Canh Tý").
 * Lưu vào cột jsonb `birth_date`, `death_date`.
 */
export const flexibleDateSchema = z
  .object({
    calendar: z.enum(["solar", "lunar"]),
    precision: z.enum(["day", "month", "year", "approx"]),
    year: z.number().int().min(1000).max(2199),
    month: z.number().int().min(1).max(12).optional(),
    day: z.number().int().min(1).max(31).optional(),
    isLeapMonth: z.boolean().optional(),
    raw: z.string().max(200).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.precision === "day" && (d.day === undefined || d.month === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cần đủ ngày và tháng", path: ["day"] });
    }
    if (d.precision === "month" && d.month === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cần có tháng", path: ["month"] });
    }
    if (d.calendar === "lunar" && d.day !== undefined && d.day > 30) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ngày âm lịch tối đa là 30", path: ["day"] });
    }
    if (d.calendar === "solar" && d.isLeapMonth) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tháng nhuận chỉ có ở âm lịch", path: ["isLeapMonth"] });
    }
  });

export type FlexibleDate = z.infer<typeof flexibleDateSchema>;

/** Slug dòng họ dùng làm subdomain: chữ thường không dấu, số, gạch ngang. */
export const RESERVED_SLUGS = [
  "www",
  "api",
  "app",
  "admin",
  "platform",
  "mail",
  "smtp",
  "static",
  "cdn",
  "assets",
  "tro-giup",
  "help",
  "status",
  "quan-tri",
] as const;

export const clanSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, {
    message: "3–40 ký tự: chữ thường không dấu, số, gạch ngang; không bắt đầu/kết thúc bằng gạch ngang",
  })
  .refine((s) => !s.includes("--"), { message: "Không dùng hai gạch ngang liền nhau" })
  .refine((s) => !(RESERVED_SLUGS as readonly string[]).includes(s), { message: "Tên này đã được hệ thống dùng" });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Định dạng lỗi chuẩn của API: `{ code, message, details }` */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
