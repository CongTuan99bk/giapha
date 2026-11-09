import { z } from "zod";
import { flexibleDateSchema, genderSchema, idSchema, privacySchema } from "./common.js";

export const otherNameSchema = z.object({
  type: z.enum(["huy", "tu", "thuy", "hieu", "khac"]),
  value: z.string().trim().min(1).max(200),
});

/** Tiểu sử: văn bản thường, xuống dòng giữ nguyên (đủ cho người lớn tuổi nhập; trình soạn thảo định dạng để sau) */
export const biographySchema = z.object({ text: z.string().trim().max(20000, { message: "Tiểu sử tối đa 20.000 ký tự" }) });

/** Thông tin thêm lưu ở bảng person_facts, mỗi loại một dòng */
export const PERSON_FACT_TYPES = ["birthPlace", "burialPlace", "occupation"] as const;
export type PersonFactType = (typeof PERSON_FACT_TYPES)[number];
const factText = z.string().trim().max(300, { message: "Tối đa 300 ký tự" }).nullable().optional();
export const personFactsSchema = z
  .object({
    /** Quê quán / nơi sinh */
    birthPlace: factText,
    /** Nơi an táng (mộ phần) */
    burialPlace: factText,
    /** Nghề nghiệp, chức tước, học vị */
    occupation: factText,
  })
  .strict();
export type PersonFacts = z.infer<typeof personFactsSchema>;

/**
 * Ngày giỗ âm lịch ghi riêng (ngày/tháng, không năm) — khi không rõ ngày mất đủ ngày tháng.
 * Có ngày mất đủ ngày tháng thì ngày giỗ luôn tự tính từ ngày mất, giá trị này bị bỏ qua.
 */
export const lunarAnniversarySchema = z
  .object({
    day: z.number().int().min(1, { message: "Ngày âm lịch từ 1 đến 30" }).max(30, { message: "Ngày âm lịch từ 1 đến 30" }),
    month: z.number().int().min(1, { message: "Tháng từ 1 đến 12" }).max(12, { message: "Tháng từ 1 đến 12" }),
    isLeapMonth: z.boolean().default(false),
  })
  .strict();
export type LunarAnniversary = z.infer<typeof lunarAnniversarySchema>;

/** Các trường hồ sơ, không có giá trị mặc định (dùng chung cho tạo mới và sửa). */
const personBaseSchema = z.object({
  fullName: z.string().trim().min(1, { message: "Cần nhập họ tên" }).max(200),
  otherNames: z.array(otherNameSchema).max(20),
  gender: genderSchema,
  isLiving: z.boolean(),
  birthDate: flexibleDateSchema.nullable(),
  deathDate: flexibleDateSchema.nullable(),
  deathAnniversaryLunar: lunarAnniversarySchema.nullable(),
  privacy: privacySchema,
  branchId: idSchema.nullable(),
  biography: biographySchema.nullable(),
  facts: personFactsSchema,
});

export const personCreateSchema = personBaseSchema
  .extend({
    otherNames: personBaseSchema.shape.otherNames.default([]),
    gender: genderSchema.default("unknown"),
    isLiving: z.boolean().default(true),
    birthDate: flexibleDateSchema.nullable().optional(),
    deathDate: flexibleDateSchema.nullable().optional(),
    deathAnniversaryLunar: lunarAnniversarySchema.nullable().optional(),
    /** Bỏ trống → hệ thống áp mặc định theo BR-PRIV-01 */
    privacy: privacySchema.optional(),
    branchId: idSchema.nullable().optional(),
    biography: biographySchema.nullable().optional(),
    facts: personFactsSchema.optional(),
  })
  .refine((p) => !(p.isLiving && p.deathDate), {
    message: "Người còn sống không có ngày mất",
    path: ["deathDate"],
  })
  .refine((p) => !(p.isLiving && p.deathAnniversaryLunar), {
    message: "Người còn sống không có ngày giỗ",
    path: ["deathAnniversaryLunar"],
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

/**
 * Đặt cha mẹ cho một người (FR-TREE-08): gắn người chưa có cha mẹ, chuyển sang cha mẹ khác khi nhập nhầm,
 * hoặc đổi con ruột/nuôi/riêng. `unionId` chọn cặp vợ chồng khi cha/mẹ có nhiều hôn phối.
 */
export const parentLinkSchema = z
  .object({
    parentId: idSchema,
    unionId: idSchema.optional(),
    relation: childRelationSchema.default("biological"),
  })
  .strict();
export type ParentLinkInput = z.infer<typeof parentLinkSchema>;

/** Thứ tự vợ/chồng (vợ cả trước) */
export const reorderUnionsSchema = z
  .object({ unionIds: z.array(idSchema).min(1).max(20) })
  .refine((v) => new Set(v.unionIds).size === v.unionIds.length, { message: "Danh sách bị trùng" });
