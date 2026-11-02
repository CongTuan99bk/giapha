import { randomUUID } from "node:crypto";
import { emailSchema, idSchema, phoneSchema } from "@coinguon/schemas";
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from "@nestjs/common";
import { z } from "zod";
import { audit } from "../common/audit.js";
import { CurrentMembership, type Membership, MinRole } from "../common/context.js";
import { notFound, unprocessable } from "../common/errors.js";
import { Database, type Tx } from "../db/database.js";

/** Chuỗi rỗng hoặc null từ form = không nhập */
const optional = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === null || (typeof v === "string" && v.trim() === "") ? undefined : v), s.optional());

/**
 * Ban liên lạc (FR-SITE-05): trưởng họ, trưởng chi, quản trị website…
 * Số điện thoại / email chỉ hiện trên trang công khai khi được bật VÀ người đó đã đồng ý (BR-PRIV-04).
 */
export const contactSchema = z
  .object({
    name: z.string().trim().min(1, { message: "Cần nhập họ tên" }).max(120),
    role: z.string().trim().min(1, { message: "Cần nhập vai trò, ví dụ Trưởng họ" }).max(80),
    phone: optional(phoneSchema),
    email: optional(emailSchema),
    showPhone: z.boolean().default(false),
    showEmail: z.boolean().default(false),
    /** Quản trị xác nhận người này đã đồng ý công khai thông tin liên lạc */
    consent: z.boolean().default(false),
    consentNote: z.string().trim().max(300).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.showPhone && !c.phone) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Chưa nhập số điện thoại", path: ["phone"] });
    if (c.showEmail && !c.email) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Chưa nhập email", path: ["email"] });
    if ((c.showPhone || c.showEmail) && !c.consent) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cần xác nhận người này đồng ý công khai số điện thoại/email", path: ["consent"] });
    }
  });
type ContactBody = z.infer<typeof contactSchema>;

const COLS = ["id", "name", "role", "phone", "email", "public_fields", "consent_at", "consent_note", "sort_order"] as const;
type Row = { id: string; name: string; role: string; phone: string | null; email: string | null; public_fields: string[]; consent_at: Date | null; consent_note: string | null; sort_order: number };

const toDto = (r: Row) => ({
  id: r.id,
  name: r.name,
  role: r.role,
  phone: r.phone,
  email: r.email,
  showPhone: r.public_fields.includes("phone"),
  showEmail: r.public_fields.includes("email"),
  consent: r.consent_at !== null,
  consentAt: r.consent_at,
  consentNote: r.consent_note,
});

/** Thông tin được phép hiện cho khách: trường bật công khai và đã có đồng ý */
export function publicContact(r: Pick<Row, "name" | "role" | "phone" | "email" | "public_fields" | "consent_at">) {
  const ok = (f: string) => r.consent_at !== null && r.public_fields.includes(f);
  return { name: r.name, role: r.role, phone: ok("phone") ? r.phone : null, email: ok("email") ? r.email : null };
}

export async function listContacts(trx: Tx) {
  const rows = await trx.selectFrom("contacts").select([...COLS]).orderBy("sort_order").orderBy("created_at").execute();
  return rows.map((r): Row => ({ ...r, public_fields: r.public_fields ?? [] }));
}

@Controller("clans/:clanId/contacts")
@MinRole("admin")
export class ContactsController {
  constructor(private readonly db: Database) {}

  private ctx(m: Membership) {
    return { clanId: m.clanId, userId: m.userId };
  }

  private values(m: Membership, c: ContactBody, prevConsentAt: Date | null) {
    return {
      name: c.name,
      role: c.role,
      phone: c.phone ?? null,
      email: c.email ?? null,
      public_fields: [...(c.showPhone ? ["phone"] : []), ...(c.showEmail ? ["email"] : [])],
      // giữ thời điểm đồng ý cũ nếu vẫn đồng ý
      consent_at: c.consent ? (prevConsentAt ?? new Date()) : null,
      consent_by: c.consent ? m.userId : null,
      consent_note: c.consentNote || null,
      updated_at: new Date(),
    };
  }

  @Get()
  async list(@CurrentMembership() m: Membership) {
    return this.db.withClan(this.ctx(m), async (trx) => (await listContacts(trx)).map(toDto));
  }

  @Post()
  async create(@CurrentMembership() m: Membership, @Body() body: unknown) {
    const c = contactSchema.parse(body);
    return this.db.withClan(this.ctx(m), async (trx) => {
      const { max } = await trx.selectFrom("contacts").select((eb) => eb.fn.max("sort_order").as("max")).executeTakeFirstOrThrow();
      const id = randomUUID();
      await trx
        .insertInto("contacts")
        .values({ id, clan_id: m.clanId, sort_order: (max ?? 0) + 1, ...this.values(m, c, null) })
        .execute();
      await audit(trx, { clanId: m.clanId, actorId: m.userId, action: "contact.create", entity: "contact", entityId: id, after: { ...c, phone: c.phone ? "(có)" : null, email: c.email ? "(có)" : null } });
      return toDto((await listContacts(trx)).find((r) => r.id === id)!);
    });
  }

  @Patch(":contactId")
  async update(@CurrentMembership() m: Membership, @Param("contactId") id: string, @Body() body: unknown) {
    const c = contactSchema.parse(body);
    return this.db.withClan(this.ctx(m), async (trx) => {
      const prev = await trx.selectFrom("contacts").select("consent_at").where("id", "=", idSchema.parse(id)).executeTakeFirst();
      if (!prev) throw notFound("Không tìm thấy người liên hệ");
      await trx.updateTable("contacts").set(this.values(m, c, prev.consent_at)).where("id", "=", id).execute();
      await audit(trx, { clanId: m.clanId, actorId: m.userId, action: "contact.update", entity: "contact", entityId: id });
      return toDto((await listContacts(trx)).find((r) => r.id === id)!);
    });
  }

  @Delete(":contactId")
  @HttpCode(204)
  async remove(@CurrentMembership() m: Membership, @Param("contactId") id: string) {
    await this.db.withClan(this.ctx(m), async (trx) => {
      const res = await trx.deleteFrom("contacts").where("id", "=", idSchema.parse(id)).executeTakeFirst();
      if (Number(res.numDeletedRows) === 0) throw notFound("Không tìm thấy người liên hệ");
      await audit(trx, { clanId: m.clanId, actorId: m.userId, action: "contact.delete", entity: "contact", entityId: id });
    });
  }

  /** Thứ tự hiển thị: trưởng họ trước */
  @Put("order")
  @HttpCode(204)
  async reorder(@CurrentMembership() m: Membership, @Body() body: unknown) {
    const { ids } = z.object({ ids: z.array(idSchema).min(1).max(100) }).strict().parse(body);
    await this.db.withClan(this.ctx(m), async (trx) => {
      const current = await listContacts(trx);
      if (current.length !== ids.length || !current.every((c) => ids.includes(c.id))) {
        throw unprocessable("CONTACT_LIST_MISMATCH", "Danh sách liên hệ không khớp với dữ liệu hiện tại");
      }
      for (const [i, id] of ids.entries()) await trx.updateTable("contacts").set({ sort_order: i + 1 }).where("id", "=", id).execute();
    });
  }
}
