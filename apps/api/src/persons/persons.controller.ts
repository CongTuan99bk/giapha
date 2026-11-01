import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from "@nestjs/common";
import {
  addChildSchema,
  addSpouseSchema,
  idSchema,
  paginationSchema,
  personCreateSchema,
  personUpdateSchema,
  reorderChildrenSchema,
} from "@coinguon/schemas";
import { z } from "zod";
import { CurrentMembership, type Membership, MinRole } from "../common/context.js";
import { Database } from "../db/database.js";
import { PersonsService } from "./persons.service.js";

const searchSchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  generation: z.coerce.number().int().min(1).optional(),
  living: z.enum(["true", "false"]).optional(),
});

/** Bỏ dấu tiếng Việt để tìm kiếm khớp cột name_unaccent (FR-PERSON-05). */
export function unaccent(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

@Controller("clans/:clanId")
export class PersonsController {
  constructor(
    private readonly db: Database,
    private readonly persons: PersonsService,
  ) {}

  private ctx(m: Membership) {
    return { clanId: m.clanId, userId: m.userId };
  }

  @Get("persons")
  async search(@CurrentMembership() m: Membership, @Query() query: unknown) {
    const { q, generation, living, page, pageSize } = searchSchema.parse(query);
    return this.db.withClan(this.ctx(m), async (trx) => {
      let base = trx.selectFrom("persons").where("clan_id", "=", m.clanId).where("deleted_at", "is", null);
      if (q) base = base.where("name_unaccent", "like", `%${escapeLike(unaccent(q))}%`);
      if (generation) base = base.where("generation", "=", generation);
      if (living) base = base.where("is_living", "=", living === "true");
      const [{ total }, items] = await Promise.all([
        base.select((eb) => eb.fn.countAll<number>().as("total")).executeTakeFirstOrThrow(),
        base
          .select(["id", "full_name", "gender", "birth_year", "death_date", "generation", "is_living", "in_clan", "privacy"])
          .orderBy("generation", (ob) => ob.asc().nullsLast())
          .orderBy("full_name")
          .limit(pageSize)
          .offset((page - 1) * pageSize)
          .execute(),
      ]);
      const hideHidden = m.role === "member" || m.role === "editor";
      return {
        items: items.map((p) => ({
          id: p.id,
          fullName: hideHidden && p.privacy === "hidden" ? "Thông tin ẩn" : p.full_name,
          gender: p.gender,
          birthYear: hideHidden && p.privacy === "hidden" ? null : p.birth_year,
          deathYear: hideHidden && p.privacy === "hidden" ? null : yearOf(p.death_date),
          generation: p.generation,
          isLiving: p.is_living,
          inClan: p.in_clan,
        })),
        total: Number(total),
        page,
        pageSize,
      };
    });
  }

  @Get("persons/:personId")
  async get(@CurrentMembership() m: Membership, @Param("personId") personId: string) {
    idSchema.parse(personId);
    return this.db.withClan(this.ctx(m), (trx) => this.persons.detail(trx, personId));
  }

  @Post("persons")
  @MinRole("editor")
  async create(@CurrentMembership() m: Membership, @Body() body: unknown) {
    const input = personCreateSchema.parse(body);
    return this.db.withClan(this.ctx(m), (trx) => this.persons.create(trx, this.actor(m), input));
  }

  @Patch("persons/:personId")
  @MinRole("editor")
  async update(@CurrentMembership() m: Membership, @Param("personId") personId: string, @Body() body: unknown) {
    idSchema.parse(personId);
    const input = personUpdateSchema.parse(body);
    return this.db.withClan(this.ctx(m), (trx) => this.persons.update(trx, this.actor(m), personId, input));
  }

  @Delete("persons/:personId")
  @MinRole("editor")
  @HttpCode(204)
  async remove(@CurrentMembership() m: Membership, @Param("personId") personId: string, @Query("confirm") confirm?: string) {
    idSchema.parse(personId);
    await this.db.withClan(this.ctx(m), (trx) => this.persons.remove(trx, this.actor(m), personId, confirm === "true"));
  }

  @Post("persons/:personId/children")
  @MinRole("editor")
  async addChild(@CurrentMembership() m: Membership, @Param("personId") personId: string, @Body() body: unknown) {
    idSchema.parse(personId);
    const input = addChildSchema.parse(body);
    return this.db.withClan(this.ctx(m), (trx) => this.persons.addChild(trx, this.actor(m), personId, input));
  }

  @Post("persons/:personId/spouses")
  @MinRole("editor")
  async addSpouse(@CurrentMembership() m: Membership, @Param("personId") personId: string, @Body() body: unknown) {
    idSchema.parse(personId);
    const input = addSpouseSchema.parse(body);
    return this.db.withClan(this.ctx(m), (trx) => this.persons.addSpouse(trx, this.actor(m), personId, input));
  }

  @Post("persons/:personId/parents")
  @MinRole("editor")
  async addParent(@CurrentMembership() m: Membership, @Param("personId") personId: string, @Body() body: unknown) {
    idSchema.parse(personId);
    const input = z.object({ person: personCreateSchema }).parse(body);
    return this.db.withClan(this.ctx(m), (trx) => this.persons.addParent(trx, this.actor(m), personId, input));
  }

  @Put("unions/:unionId/children/order")
  @MinRole("editor")
  @HttpCode(204)
  async reorder(@CurrentMembership() m: Membership, @Param("unionId") unionId: string, @Body() body: unknown) {
    idSchema.parse(unionId);
    const { childIds } = reorderChildrenSchema.parse(body);
    await this.db.withClan(this.ctx(m), (trx) => this.persons.reorderChildren(trx, this.actor(m), unionId, childIds));
  }

  private actor(m: Membership) {
    return { clanId: m.clanId, userId: m.userId };
  }
}

/** Năm trong ngày linh hoạt (jsonb) — null nếu không có. */
function yearOf(date: unknown): number | null {
  const y = (date as { year?: unknown } | null)?.year;
  return typeof y === "number" ? y : null;
}
