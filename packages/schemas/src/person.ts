import { z } from "zod";
import { flexibleDateSchema, genderSchema, idSchema, privacySchema } from "./common.js";

export const otherNameSchema = z.object({
  type: z.enum(["huy", "tu", "thuy", "hieu", "khac"]),
  value: z.string().trim().min(1).max(200),
});

/** Các trường hồ sơ, không có giá trị mặc định (dùng chung cho tạo mới và sửa). */
const personBaseSchema = z.object({
  fullName: z.string().trim().min(1, { message: "Cần nhập họ tên" }).max(200),
  otherNames: z.array(otherNameSchema).max(20),
  gender: genderSchema,
  isLiving: z.boolean(),
  birthDate: flexibleDateSchema.nullable(),
  deathDate: flexibleDateSchema.nullable(),
  privacy: privacySchema,
  branchId: idSchema.nullable(),
  /** Tiểu sử dạng rich text (JSON của trình soạn thảo) */
  biography: z.unknown(),
});

export const personCreateSchema = personBaseSchema
  .extend({
    otherNames: personBaseSchema.shape.otherNames.default([]),
    gender: genderSchema.default("unknown"),
    isLiving: z.boolean().default(true),
    birthDate: flexibleDateSchema.nullable().optional(),
    deathDate: flexibleDateSchema.nullable().optional(),
    /** Bỏ trống → hệ thống áp mặc định theo BR-PRIV-01 */
    privacy: privacySchema.optional(),
    branchId: idSchema.nullable().optional(),
    biography: z.unknown().optional(),
  })
  .refine((p) => !(p.isLiving && p.deathDate), {
    message: "Người còn sống không có ngày mất",
    path: ["deathDate"],
  });
export type PersonCreateInput = z.infer<typeof personCreateSchema>;

/** Sửa người: chỉ gửi trường thay đổi, bắt buộc kèm `version` để chống ghi đè (BR-TREE-07). */
export const personUpdateSchema = personBaseSchema
  .partial()
  .extend({ version: z.number().int().min(0) })
  .strict();
export type PersonUpdateInput = z.infer<typeof personUpdateSchema>;

/** Mặc định riêng tư (BR-PRIV-01): người đã mất công khai, người còn sống chỉ thành viên xem. */
export function defaultPrivacy(isLiving: boolean): "public" | "members" {
  return isLiving ? "members" : "public";
}

export const childRelationSchema = z.enum(["biological", "adopted", "step"]);

/** Thêm con cho một người trong một thao tác (FR-TREE-03, 04). */
export const addChildSchema = z.object({
  /** Hôn phối mà đứa con thuộc về; bỏ trống khi người cha/mẹ chỉ có một hôn phối hoặc chưa có */
  unionId: idSchema.optional(),
  relation: childRelationSchema.default("biological"),
  person: personCreateSchema,
});
export type AddChildInput = z.infer<typeof addChildSchema>;

export const addSpouseSchema = z.object({
  /** Người đã có trong cây, hoặc tạo người mới */
  existingPersonId: idSchema.optional(),
  person: personCreateSchema.optional(),
  type: z.enum(["marriage", "partnership", "other"]).default("marriage"),
}).refine((v) => Boolean(v.existingPersonId) !== Boolean(v.person), {
  message: "Chọn người có sẵn hoặc nhập người mới (không cả hai)",
});

export const reorderChildrenSchema = z.object({
  /** Danh sách id con theo thứ tự mới, con trưởng trước */
  childIds: z.array(idSchema).min(1).max(100),
}).refine((v) => new Set(v.childIds).size === v.childIds.length, {
  message: "Danh sách con bị trùng",
});
