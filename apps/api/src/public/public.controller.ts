import { layoutTree } from "@coinguon/genealogy-core";
import { idSchema } from "@coinguon/schemas";
import { Controller, Get, Param, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { AlbumsService } from "../albums/albums.service.js";
import { loadAnniversarySources } from "../anniversaries/anniversaries.controller.js";
import { todayInVietnam, upcomingAnniversaries } from "../anniversaries/upcoming.js";
import { Public } from "../common/context.js";
import { notFound } from "../common/errors.js";
import { RateLimit } from "../common/rate-limit.js";
import { ResponseCache, sendCached } from "../common/response-cache.js";
import { listContacts, publicContact } from "../contacts/contacts.controller.js";
import { Database, type Tx } from "../db/database.js";
import { MediaService, type MediaRow, type Variant } from "../media/media.service.js";
import { PersonsService } from "../persons/persons.service.js";
import { SiteService } from "../site/site.service.js";
import { GraphService, type PersonSummaryRow } from "../tree/graph.service.js";
import { TREE_NODE_SIZE } from "../tree/tree.controller.js";
import { type MainClan, MainClanService } from "./main-clan.service.js";

/** Website công khai chỉ có người ĐÃ MẤT và để chế độ "Mọi người" (quyết định chủ dự án 2026-11-02) */
export const isPublicPerson = (p: { is_living: boolean; privacy: string }) => !p.is_living && p.privacy === "public";

/** Ảnh công khai chỉ có cỡ xem; ảnh gốc độ phân giải cao dành cho thành viên */
const PUBLIC_VARIANTS = ["sm", "md", "lg"] as const;
/** Ảnh cho khách: chỉ cỡ xem (không có ảnh gốc), đường dẫn công khai */
const publicPhoto = (m: MediaRow) => ({ id: m.id, width: m.width, height: m.height, caption: m.caption, urls: publicUrls(m.id) });

const publicUrls = (id: string) =>
  Object.fromEntries(PUBLIC_VARIANTS.map((v) => [v, `/api/v1/public/media/${id}/${v}`])) as Record<(typeof PUBLIC_VARIANTS)[number], string>;

function yearOf(date: unknown): number | null {
  const y = (date as { year?: unknown } | null)?.year;
  return typeof y === "number" ? y : null;
}


/**
 * Khách xem: trình duyệt (và Cloudflare nếu có) được giữ bản sao nhưng luôn hỏi lại máy chủ —
 * câu trả lời "không đổi" (304) rất nhẹ, còn khi ban quản lý sửa thì khách thấy ngay.
 */
const PUBLIC_JSON_CACHE = "public, no-cache";

/**
 * Trang công khai của dòng họ chính (chế độ một dòng họ) — không cần đăng nhập.
 * Mọi truy vấn vẫn qua RLS với ngữ cảnh dòng họ, không có người dùng.
 * Kết quả được nhớ trong bộ nhớ đệm đến khi dòng họ có thay đổi (ResponseCache): đông người xem cùng lúc
 * (ngày giỗ Tổ, họp họ) chỉ tốn một lần truy vấn.
 */
@Public()
// Rộng tay: cả nhà thờ họ dùng chung một wifi / mạng di động (cùng IP) vẫn xem được thoải mái
@RateLimit("public", { limit: 3000, windowSec: 300 })
@Controller("public")
export class PublicController {
  constructor(
    private readonly db: Database,
    private readonly graph: GraphService,
    private readonly persons: PersonsService,
    private readonly site: SiteService,
    private readonly media: MediaService,
    private readonly cache: ResponseCache,
    private readonly clans: MainClanService,
    private readonly albums: AlbumsService,
  ) {}

  private mainClan(): Promise<MainClan> {
    return this.clans.get();
  }

  /** Dựng (hoặc lấy lại) phản hồi JSON theo khoá rồi gửi đi */
  private async respond(req: Request, res: Response, key: string, build: (trx: Tx, clan: MainClan) => Promise<unknown>): Promise<void> {
    const clan = await this.mainClan();
    const body = await this.cache.json(clan.id, `public:${key}`, () => this.db.withClan({ clanId: clan.id, userId: null }, (trx) => build(trx, clan)));
    await sendCached(req, res, body, PUBLIC_JSON_CACHE);
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

  /** Ảnh khách được xem: banner trang chủ + chân dung người công khai (mã ảnh → bản ghi ảnh) */
  private async publicMedia(trx: Tx, clanId: string): Promise<Map<string, MediaRow>> {
    const home = await this.site.getHome(trx, clanId);
    const avatars = await trx
      .selectFrom("persons")
      .select("avatar_media_id")
      .where("avatar_media_id", "is not", null)
      .where("deleted_at", "is", null)
      .where("is_living", "=", false)
      .where("privacy", "=", "public")
      .execute();
    // ảnh trong album công khai
    const albumPhotos = await trx
      .selectFrom("media as m")
      .innerJoin("albums as a", "a.id", "m.album_id")
      .select("m.id")
      .where("a.visibility", "=", "public")
      .where("a.deleted_at", "is", null)
      .where("m.deleted_at", "is", null)
      .execute();
    const ids = [...new Set([...home.banners.map((b) => b.id), ...avatars.map((a) => a.avatar_media_id!), ...albumPhotos.map((p) => p.id)])];
    return new Map((await this.media.getMany(trx, ids)).map((r) => [r.id, r]));
  }

  /** Trang chủ: tên dòng họ, banner, câu đối, địa chỉ nhà thờ họ, số người, ban liên lạc */
  @Get("site")
  siteInfo(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.respond(req, res, "site", async (trx, clan) => {
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
  tree(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.respond(req, res, "tree", async (trx, clan) => {
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
  person(@Param("personId") personId: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const id = idSchema.parse(personId);
    return this.respond(req, res, `person:${id}`, async (trx, clan) => {
      const allowed = await this.cache.memo(clan.id, "public:ids", () => this.publicIds(trx), { sizeOf: (s) => s.size * 80 });
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

  /** Thư viện ảnh: album công khai có ảnh, mới thêm ảnh lên trước */
  @Get("albums")
  albumList(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.respond(req, res, "albums", (trx) => this.albums.list(trx, { publicOnly: true, toDto: publicPhoto }));
  }

  @Get("albums/:albumId")
  album(@Param("albumId") albumId: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const id = idSchema.parse(albumId);
    return this.respond(req, res, `album:${id}`, (trx) => this.albums.detail(trx, id, { publicOnly: true, toDto: publicPhoto }));
  }

  @Get("anniversaries")
  anniversaries(@Query() raw: unknown, @Req() req: Request, @Res() res: Response): Promise<void> {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(400).default(365) }).parse(raw);
    const from = todayInVietnam();
    // khoá theo ngày: sang ngày mới thì "còn mấy ngày" tự tính lại
    const today = `${from.year}-${from.month}-${from.day}`;
    return this.respond(req, res, `anniversaries:${today}:${days}`, async (trx, clan) => {
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
    const clan = await this.mainClan();
    const allowed = await this.cache.memo(
      clan.id,
      "public:media",
      () => this.db.withClan({ clanId: clan.id, userId: null }, (trx) => this.publicMedia(trx, clan.id)),
      {
        sizeOf: (m) => m.size * 400,
      },
    );
    const row = allowed.get(id);
    if (!row) throw notFound("Không tìm thấy ảnh");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type("image/webp");
    res.sendFile(this.media.filePath(row, v), { dotfiles: "deny" }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ code: "NOT_FOUND", message: "Không tìm thấy file ảnh" });
    });
  }
}
