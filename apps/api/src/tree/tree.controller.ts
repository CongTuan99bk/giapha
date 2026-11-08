import { kinship, layoutTree } from "@coinguon/genealogy-core";
import { idSchema } from "@coinguon/schemas";
import { Controller, Get, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { CurrentMembership, type Membership, ROLE_RANK } from "../common/context.js";
import { notFound } from "../common/errors.js";
import { ResponseCache, sendCached } from "../common/response-cache.js";
import { Database, type Tx } from "../db/database.js";
import { GraphService, type LoadedGraph, type PersonSummaryRow } from "./graph.service.js";

const treeQuery = z.object({
  rootId: idSchema.optional(),
  depth: z.coerce.number().int().min(1).max(60).optional(),
  orientation: z.enum(["vertical", "horizontal"]).default("vertical"),
  collapsed: z
    .string()
    .optional()
    .transform((s) => new Set(s ? s.split(",").filter(Boolean) : [])),
});

/** Ô người rộng hơn mặc định để chứa ảnh chân dung + 2 dòng tên (dùng chung cho phả đồ công khai) */
export const TREE_NODE_SIZE = { nodeWidth: 172, nodeHeight: 76 } as const;

const kinshipQuery = z.object({ a: idSchema, b: idSchema });

function yearOf(date: unknown): number | null {
  if (date && typeof date === "object" && "year" in date && typeof (date as { year: unknown }).year === "number") {
    return (date as { year: number }).year;
  }
  return null;
}

@Controller("clans/:clanId")
export class TreeController {
  constructor(
    private readonly db: Database,
    private readonly graph: GraphService,
    private readonly cache: ResponseCache,
  ) {}

  /** FR-TREE-01/06: cây đã tính bố cục — giao diện chỉ việc vẽ. Kết quả được nhớ đến khi dòng họ có thay đổi. */
  @Get("tree")
  async tree(@CurrentMembership() m: Membership, @Query() query: unknown, @Req() req: Request, @Res() res: Response) {
    const q = treeQuery.parse(query);
    const canSeeHidden = ROLE_RANK[m.role] >= ROLE_RANK.admin;
    const key = ["tree", canSeeHidden ? "admin" : "member", q.rootId ?? "", q.orientation, q.depth ?? "", [...q.collapsed].sort().join(",")].join("|");
    const body = await this.cache.json(m.clanId, key, () =>
      this.db.withClan({ clanId: m.clanId, userId: m.userId }, (trx) => this.buildTree(trx, m.clanId, q, canSeeHidden)),
    );
    // private: chỉ trình duyệt của thành viên giữ, không proxy/CDN nào được lưu
    await sendCached(req, res, body, "private, no-cache");
  }

  /** Cả cây của dòng họ (đọc chung cho phả đồ và xưng hô), nhớ đến khi có thay đổi */
  private loadGraph(trx: Tx, clanId: string): Promise<LoadedGraph> {
    return this.cache.memo(clanId, "graph", () => this.graph.load(trx, clanId), { sizeOf: (g) => g.persons.size * 900 });
  }

  private async buildTree(trx: Tx, clanId: string, q: z.infer<typeof treeQuery>, canSeeHidden: boolean) {
    const clan = await trx.selectFrom("clans").select("root_person_id").where("id", "=", clanId).executeTakeFirstOrThrow();
    const rootId = q.rootId ?? clan.root_person_id;
    if (!rootId) return { rootId: null, nodes: [], edges: [], width: 0, height: 0 };
    const { index, persons } = await this.loadGraph(trx, clanId);
    if (!persons.has(rootId)) throw notFound("Không tìm thấy người làm gốc phả đồ");

    const layout = layoutTree(index, {
      rootId,
      ...TREE_NODE_SIZE,
      orientation: q.orientation,
      collapsed: q.collapsed,
      ...(q.depth ? { maxDepth: q.depth } : {}),
    });
    const view = (p: PersonSummaryRow) => {
      const hidden = p.privacy === "hidden" && !canSeeHidden;
      return {
        id: p.id,
        fullName: hidden ? "Thông tin ẩn" : p.full_name,
        gender: p.gender,
        birthYear: hidden ? null : p.birth_year,
        deathYear: hidden ? null : yearOf(p.death_date),
        isLiving: p.is_living,
        generation: p.generation,
        inClan: p.in_clan,
        hasAvatar: !hidden && p.avatar_media_id !== null,
        avatarMediaId: hidden ? null : p.avatar_media_id,
      };
    };
    return {
      rootId,
      width: layout.width,
      height: layout.height,
      nodes: layout.nodes.map((n) => ({
        ...n,
        person: view(persons.get(n.personId)!),
      })),
      edges: layout.edges,
    };
  }

  /** FR-KIN-01: xưng hô hai chiều giữa hai người */
  @Get("kinship")
  async kinship(@CurrentMembership() m: Membership, @Query() query: unknown) {
    const { a, b } = kinshipQuery.parse(query);
    return this.db.withClan({ clanId: m.clanId, userId: m.userId }, async (trx) => {
      const clan = await trx.selectFrom("clans").select("kinship_variant").where("id", "=", m.clanId).executeTakeFirstOrThrow();
      const { index } = await this.loadGraph(trx, m.clanId);
      if (!index.has(a) || !index.has(b)) throw notFound("Không tìm thấy người được chọn");
      const variant = clan.kinship_variant;
      const ab = kinship(index, a, b, { variant });
      const ba = kinship(index, b, a, { variant });
      if (!ab || !ba) {
        return {
          related: false,
          message: "Không cùng huyết thống trong dữ liệu hiện có",
        };
      }
      return {
        related: true,
        aCallsB: ab.term,
        bCallsA: ba.term,
        kind: ab.kind,
        side: ab.side,
        generationGap: ab.generationGap,
        viaMarriage: ab.viaMarriage,
        commonAncestorId: ab.commonAncestorId,
        path: ab.path,
      };
    });
  }
}
