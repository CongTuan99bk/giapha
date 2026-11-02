import { layoutTree } from "@coinguon/genealogy-core";
import { idSchema } from "@coinguon/schemas";
import { Controller, Get, Inject, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { loadAnniversarySources } from "../anniversaries/anniversaries.controller.js";
import { todayInVietnam, upcomingAnniversaries } from "../anniversaries/upcoming.js";
import { Public } from "../common/context.js";
import { AppError, notFound } from "../common/errors.js";
import { RateLimit } from "../common/rate-limit.js";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { listContacts, publicContact } from "../contacts/contacts.controller.js";
import { Database, type Tx } from "../db/database.js";
import { MediaService, type Variant } from "../media/media.service.js";
import { PersonsService } from "../persons/persons.service.js";
import { SiteService } from "../site/site.service.js";
import { GraphService, type PersonSummaryRow } from "../tree/graph.service.js";
import { TREE_NODE_SIZE } from "../tree/tree.controller.js";

/** Website công khai chỉ có người ĐÃ MẤT và để chế độ "Mọi người" (quyết định chủ dự án 2026-11-02) */
export const isPublicPerson = (p: { is_living: boolean; privacy: string }) => !p.is_living && p.privacy === "public";

/** Ảnh công khai chỉ có cỡ xem; ảnh gốc độ phân giải cao dành cho thành viên */
const PUBLIC_VARIANTS = ["sm", "md", "lg"] as const;
const publicUrls = (id: string) => Object.fromEntries(PUBLIC_VARIANTS.map((v) => [v, `/api/v1/public/media/${id}/${v}`])) as Record<(typeof PUBLIC_VARIANTS)[number], string>;

function yearOf(date: unknown): number | null {
  const y = (date as { year?: unknown } | null)?.year;
  return typeof y === "number" ? y : null;
}

interface MainClan {
  id: string;
  name: string;
  surname: string;
  origin_place: string | null;
  root_person_id: string | null;
  day30_rule: "day29" | "nextMonthDay1";
}

/**
 * Trang công khai của dòng họ chính (chế độ một dòng họ) — không cần đăng nhập.
 * Mọi truy vấn vẫn qua RLS với ngữ cảnh dòng họ, không có người dùng.
 */
@Public()
@RateLimit("public", { limit: 600, windowSec: 300 })
@Controller("public")
export class PublicController {
  constructor(
    private readonly db: Database,
    private readonly graph: GraphService,
    private readonly persons: PersonsService,
    private readonly site: SiteService,
    private readonly media: MediaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async run<T>(fn: (trx: Tx, clan: MainClan) => Promise<T>): Promise<T> {
    if (this.config.CLAN_MODE !== "single") throw new AppError(404, "NO_PUBLIC_SITE", "Chưa có trang công khai");
    const clan = await this.db.app
      .selectFrom("clans")
      .select(["id", "name", "surname", "origin_place", "root_person_id", "day30_rule"])
      .where("deleted_at", "is", null)
      .orderBy("created_at")
      .executeTakeFirst();
    if (!clan) throw new AppError(404, "NO_PUBLIC_SITE", "Chưa có trang công khai");
    return this.db.withClan({ clanId: clan.id, userId: null }, (trx) => fn(trx, clan));
  }

  private async publicIds(trx: Tx): Promise<Set<string>> {
    const rows = await trx
      .selectFrom("persons")
      .select("id")
      .where("deleted_at", "is", null)
      .where("is_living", "=", false)
      .where("privacy", "=", "public")
      .execute();
    return new Set(rows.map((r) => r.id));
  }

  /** Trang chủ: tên dòng họ, banner, câu đối, địa chỉ nhà thờ họ, số người, ban liên lạc */
  @Get("site")
  siteInfo(): Promise<unknown> {
    return this.run(async (trx, clan) => {
      const home = await this.site.getHome(trx, clan.id);
      const stats = await trx
        .selectFrom("persons")
        .select((eb) => [eb.fn.countAll<string>().as("people"), eb.fn.max("generation").as("generations")])
        .where("deleted_at", "is", null)
        .where("is_living", "=", false)
        .where("privacy", "=", "public")
        .executeTakeFirstOrThrow();
      return {
        clan: { name: clan.name, surname: clan.surname, originPlace: clan.origin_place },
        home: {
          banners: home.banners.map((b) => ({ id: b.id, width: b.width, height: b.height, caption: b.caption, urls: publicUrls(b.id) })),
          couplet: home.couplet,
          motto: home.motto,
          templeAddress: home.templeAddress,
        },
        stats: { people: Number(stats.people), generations: stats.generations ?? 0 },
        contacts: (await listContacts(trx)).map(publicContact),
      };
    });
  }

  /** Phả đồ chỉ người đã mất (để công khai), bố cục giống phả đồ thành viên */
  @Get("tree")
  tree(): Promise<unknown> {
    return this.run(async (trx, clan) => {
      const empty = { rootId: null, nodes: [], edges: [], width: 0, height: 0 };
      if (!clan.root_person_id) return empty;
      const { index, persons } = await this.graph.load(trx, clan.id, (p: PersonSummaryRow) => isPublicPerson(p));
      if (!persons.has(clan.root_person_id)) return empty;
      const layout = layoutTree(index, { rootId: clan.root_person_id, ...TREE_NODE_SIZE, orientation: "vertical", collapsed: new Set() });
      return {
        rootId: clan.root_person_id,
        width: layout.width,
        height: layout.height,
        edges: layout.edges,
        nodes: layout.nodes.map((n) => {
          const p = persons.get(n.personId)!;
          return {
            ...n,
            person: {
              id: p.id,
              fullName: p.full_name,
              gender: p.gender,
              birthYear: p.birth_year,
              deathYear: yearOf(p.death_date),
              isLiving: false,
              generation: p.generation,
              inClan: p.in_clan,
              hasAvatar: p.avatar_media_id !== null,
              avatarMediaId: p.avatar_media_id,
            },
          };
        }),
      };
    });
  }

  /** Hồ sơ một người đã mất; người thân còn sống hoặc không công khai bị lược bỏ */
  @Get("persons/:personId")
  person(@Param("personId") personId: string): Promise<unknown> {
    const id = idSchema.parse(personId);
    return this.run(async (trx) => {
      const allowed = await this.publicIds(trx);
      if (!allowed.has(id)) throw notFound("Không tìm thấy người này trên trang công khai");
      const d = await this.persons.detail(trx, id);
      const keep = <T extends { id: string }>(xs: T[]) => xs.filter((x) => allowed.has(x.id));
      return {
        id: d.id,
        fullName: d.fullName,
        otherNames: d.otherNames,
        gender: d.gender,
        birthDate: d.birthDate,
        deathDate: d.deathDate,
        deathAnniversaryLunar: d.deathAnniversaryLunar,
        generation: d.generation,
        inClan: d.inClan,
        avatarMediaId: d.avatarMediaId,
        biography: d.biography,
        facts: d.facts,
        childOf: d.childOf.map((c) => ({ ...c, parents: keep(c.parents) })),
        unions: d.unions
          .filter((u) => !u.partner || allowed.has(u.partner.id))
          .map((u) => ({ id: u.id, orderIndex: u.orderIndex, partner: u.partner, children: keep(u.children) })),
      };
    });
  }

  @Get("anniversaries")
  anniversaries(@Query() raw: unknown): Promise<unknown> {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(400).default(365) }).parse(raw);
    return this.run(async (trx, clan) => {
      const from = todayInVietnam();
      const { sources } = await loadAnniversarySources(trx, clan.id, "public");
      const items = upcomingAnniversaries(sources, { from, days, day30Rule: clan.day30_rule });
      return { from: `${from.year}-${String(from.month).padStart(2, "0")}-${String(from.day).padStart(2, "0")}`, days, items, missingDeathDay: 0 };
    });
  }

  /** Ảnh công khai: chỉ ảnh banner trang chủ và ảnh chân dung của người được công khai */
  @Get("media/:mediaId/:variant")
  async file(@Param("mediaId") mediaId: string, @Param("variant") variant: string, @Res() res: Response) {
    const v = z.enum(PUBLIC_VARIANTS).parse(variant) as Variant;
    const id = idSchema.parse(mediaId);
    const row = await this.run(async (trx, clan) => {
      const home = await this.site.getHome(trx, clan.id);
      const isBanner = home.banners.some((b) => b.id === id);
      const isAvatar =
        !isBanner &&
        (await trx
          .selectFrom("persons")
          .select("id")
          .where("avatar_media_id", "=", id)
          .where("deleted_at", "is", null)
          .where("is_living", "=", false)
          .where("privacy", "=", "public")
          .executeTakeFirst());
      if (!isBanner && !isAvatar) throw notFound("Không tìm thấy ảnh");
      return this.media.get(trx, id);
    });
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type("image/webp");
    res.sendFile(this.media.filePath(row, v), { dotfiles: "deny" }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ code: "NOT_FOUND", message: "Không tìm thấy file ảnh" });
    });
  }
}
