import { z } from "zod";
import { emailSchema, idSchema, parseLoginId, vnPhoneSchema } from "./common.js";

/** Các trường liên hệ có thể bật công khai từng cái (FR-SITE-05). */
export const CONTACT_PUBLIC_FIELDS = ["phone", "email", "zalo", "photo"] as const;
export type ContactPublicField = (typeof CONTACT_PUBLIC_FIELDS)[number];

export const contactInputSchema = z
  .object({
    memberId: idSchema.nullable().optional(),
    name: z.string().trim().min(1, { message: "Cần nhập họ tên" }).max(120),
    role: z.string().trim().min(1, { message: "Cần nhập vai trò" }).max(80),
    phone: vnPhoneSchema.nullable().optional(),
    email: emailSchema.nullable().optional(),
    zalo: vnPhoneSchema.nullable().optional(),
    photoMediaId: idSchema.nullable().optional(),
    publicFields: z.array(z.enum(CONTACT_PUBLIC_FIELDS)).default([]),
    sortOrder: z.number().int().min(0).default(0),
    /** Ghi chú cách xác nhận đồng ý với người không có tài khoản (FR-SITE-11) */
    consentNote: z.string().trim().max(300).optional(),
  })
  .superRefine((c, ctx) => {
    for (const f of c.publicFields) {
      const value = f === "photo" ? c.photoMediaId : c[f];
      if (!value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Không thể công khai trường trống: ${f}`,
          path: ["publicFields"],
        });
      }
    }
  });
export type ContactInput = z.infer<typeof contactInputSchema>;

/** Bản ghi liên hệ như lưu trong DB (đủ để áp quy tắc hiển thị). */
export interface ContactRecord {
  name: string;
  role: string;
  phone?: string | null;
  email?: string | null;
  zalo?: string | null;
  photoUrl?: string | null;
  publicFields: readonly ContactPublicField[];
  /** Thời điểm người liên hệ đồng ý công khai; null = chưa đồng ý */
  consentAt?: Date | string | null;
}

export interface PublicContactView {
  name: string;
  role: string;
  phone: string | null;
  /** Email đã che, ví dụ "ng***@gmail.com" (BR-PRIV-05) */
  emailMasked: string | null;
  /** Có Zalo công khai — số Zalo chỉ trả khi người xem bấm "Nhắn Zalo" */
  zalo: string | null;
  photoUrl: string | null;
  /** Chưa đồng ý: website chỉ hiện tên, vai trò và form gửi tin */
  contactFormOnly: boolean;
}

/** Che email: giữ 2 ký tự đầu, phần còn lại thay bằng *** (BR-PRIV-05). */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const visible = local.slice(0, Math.min(2, Math.max(1, local.length - 1)));
  return `${visible}***${email.slice(at)}`;
}

/**
 * Thông tin liên hệ được phép hiện trên website công khai (BR-PRIV-04, 05):
 * một trường chỉ hiện khi được bật công khai VÀ người đó đã đồng ý.
 */
export function toPublicContact(c: ContactRecord): PublicContactView {
  const consented = Boolean(c.consentAt);
  const show = (f: ContactPublicField) => consented && c.publicFields.includes(f);
  const phone = show("phone") ? (c.phone ?? null) : null;
  const email = show("email") && c.email ? maskEmail(c.email) : null;
  const zalo = show("zalo") ? (c.zalo ?? null) : null;
  const photoUrl = show("photo") ? (c.photoUrl ?? null) : null;
  return {
    name: c.name,
    role: c.role,
    phone,
    emailMasked: email,
    zalo,
    photoUrl,
    contactFormOnly: !phone && !email && !zalo,
  };
}

/**
 * Form "Gửi lời nhắn" trên trang công khai (FR-SITE-08).
 * Chống spam: giới hạn tần suất theo IP + ô bẫy `website` (người thật không thấy, máy tự điền).
 * `turnstileToken` để dành khi bật Cloudflare Turnstile.
 */
export const contactMessageSchema = z.object({
  name: z.string().trim().min(1, { message: "Cần nhập họ tên" }).max(120),
  /** Số điện thoại hoặc email để ban quản lý liên lạc lại */
  replyTo: z
    .string()
    .trim()
    .min(1, { message: "Cần nhập số điện thoại hoặc email để liên lạc lại" })
    .max(254)
    .refine((v) => parseLoginId(v) !== null, { message: "Số điện thoại hoặc email chưa đúng" }),
  message: z.string().trim().min(5, { message: "Nội dung quá ngắn" }).max(4000, { message: "Tối đa 4000 ký tự" }),
  website: z.string().max(500).optional(),
  turnstileToken: z.string().optional(),
});
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
