import { randomUUID } from "node:crypto";
import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { clanSlugSchema, idSchema } from "@coinguon/schemas";
import { z } from "zod";
import { audit } from "../common/audit.js";
import { CurrentMembership, CurrentUser, type Membership, MinRole, type SessionUser } from "../common/context.js";
import { conflict, unprocessable } from "../common/errors.js";
import { Database } from "../db/database.js";
import { GraphService } from "../tree/graph.service.js";

const createClanSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: clanSlugSchema,
  surname: z.string().trim().min(1).max(40),
  originPlace: z.string().trim().max(200).optional(),
});

const updateClanSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    surname: z.string().trim().min(1).max(40),
    originPlace: z.string().trim().max(200).nullable(),
    lineageMode: z.enum(["patrilineal", "matrilineal"]),
    kinshipVariant: z.enum(["bac", "trung", "nam"]),
    day30Rule: z.enum(["day29", "nextMonthDay1"]),
    rootPersonId: idSchema,
  })
  .partial()
  .strict();

const CLAN_COLUMNS = [
  "c.id",
  "c.name",
  "c.slug",
  "c.surname",
  "c.origin_place",
  "c.lineage_mode",
  "c.kinship_variant",
  "c.day30_rule",
  "c.root_person_id",
] as const;

function toClan(c: {
  id: string;
  name: string;
  slug: string;
  surname: string;
  origin_place: string | null;
  lineage_mode: string;
  kinship_variant: string;
  day30_rule: string;
  root_person_id: string | null;
}) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    surname: c.surname,
    originPlace: c.origin_place,
    lineageMode: c.lineage_mode,
    kinshipVariant: c.kinship_variant,
    day30Rule: c.day30_rule,
    rootPersonId: c.root_person_id,
  };
}

@Controller()
export class ClansController {
  constructor(
    private readonly db: Database,
    private readonly graph: GraphService,
  ) {}

  /** FR-CLAN-01: tạo dòng họ — người tạo là chủ sở hữu */
  @Post("clans")
  async create(@Body() body: unknown, @CurrentUser() user: SessionUser) {
    const input = createClanSchema.parse(body);
    const clanId = randomUUID();
    const taken = await this.db.app.selectFrom("clans").select("id").where("slug", "=", input.slug).executeTakeFirst();
    if (taken) throw conflict("SLUG_TAKEN", "Tên miền con này đã có dòng họ dùng");

    await this.db.app
      .insertInto("clans")
      .values({
        id: clanId,
        name: input.name,
        slug: input.slug,
        surname: input.surname,
        origin_place: input.originPlace ?? null,
        updated_at: new Date(),
      })
      .execute();
    await this.db.withClan({ clanId, userId: user.id }, async (trx) => {
      await trx.insertInto("clan_members").values({ id: randomUUID(), clan_id: clanId, user_id: user.id, role: "owner" }).execute();
      await trx.insertInto("site_settings").values({ clan_id: clanId, data: "{}", updated_at: new Date() }).execute();
      await audit(trx, { clanId, actorId: user.id, action: "clan.create", entity: "clan", entityId: clanId, after: input });
    });
    return { id: clanId, ...input, role: "owner" };
  }

  /** FR-CLAN-06: các dòng họ tôi tham gia */
  @Get("me/clans")
  async mine(@CurrentUser() user: SessionUser) {
    const rows = await this.db.withUser(user.id, (trx) =>
      trx
        .selectFrom("clan_members as m")
        .innerJoin("clans as c", "c.id", "m.clan_id")
        .select([...CLAN_COLUMNS, "m.role"])
        .where("m.user_id", "=", user.id)
        .where("c.deleted_at", "is", null)
        .orderBy("c.name")
        .execute(),
    );
    return rows.map((r) => ({ ...toClan(r), role: r.role }));
  }

  @Get("clans/:clanId")
  async get(@CurrentMembership() m: Membership) {
    const c = await this.db.withClan({ clanId: m.clanId, userId: m.userId }, (trx) =>
      trx.selectFrom("clans as c").select(CLAN_COLUMNS).where("c.id", "=", m.clanId).executeTakeFirstOrThrow(),
    );
    return { ...toClan(c), role: m.role, myPersonId: m.personId };
  }

  @Patch("clans/:clanId")
  @MinRole("admin")
  async update(@Param("clanId") clanId: string, @Body() body: unknown, @CurrentUser() user: SessionUser) {
    const input = updateClanSchema.parse(body);
    return this.db.withClan({ clanId, userId: user.id }, async (trx) => {
      if (input.rootPersonId) {
        const p = await trx
          .selectFrom("persons")
          .select("id")
          .where("id", "=", input.rootPersonId)
          .where("deleted_at", "is", null)
          .executeTakeFirst();
        if (!p) throw unprocessable("ROOT_NOT_FOUND", "Không tìm thấy người được chọn làm thuỷ tổ");
      }
      await trx
        .updateTable("clans")
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.surname !== undefined && { surname: input.surname }),
          ...(input.originPlace !== undefined && { origin_place: input.originPlace }),
          ...(input.lineageMode !== undefined && { lineage_mode: input.lineageMode }),
          ...(input.kinshipVariant !== undefined && { kinship_variant: input.kinshipVariant }),
          ...(input.day30Rule !== undefined && { day30_rule: input.day30Rule }),
          ...(input.rootPersonId !== undefined && { root_person_id: input.rootPersonId }),
          updated_at: new Date(),
        })
        .where("id", "=", clanId)
        .execute();
      // Đổi thuỷ tổ hoặc cách tính "thuộc họ" → tính lại đời & nhánh cho cả dòng họ
      if (input.rootPersonId !== undefined || input.lineageMode !== undefined) {
        await this.graph.recomputeLineage(trx, clanId);
      }
      await audit(trx, { clanId, actorId: user.id, action: "clan.update", entity: "clan", entityId: clanId, after: input });
      const c = await trx.selectFrom("clans as c").select(CLAN_COLUMNS).where("c.id", "=", clanId).executeTakeFirstOrThrow();
      return toClan(c);
    });
  }
}
