import { kinship } from "@coinguon/genealogy-core";
import { idSchema } from "@coinguon/schemas";
import { Controller, Get, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { CurrentMembership, type Membership, ROLE_RANK } from "../common/context.js";
import { notFound } from "../common/errors.js";
import { ResponseCache, sendCached } from "../common/response-cache.js";
import { Database } from "../db/database.js";
import { TREE_NODE_SIZE, TreeBuilder, treeQuery } from "./tree-builder.service.js";

export { TREE_NODE_SIZE };

const kinshipQuery = z.object({ a: idSchema, b: idSchema });

@Controller("clans/:clanId")
export class TreeController {
  constructor(
    private readonly db: Database,
    private readonly builder: TreeBuilder,
    private readonly cache: ResponseCache,
  ) {}

  /** FR-TREE-01/06: cây đã tính bố cục — giao diện chỉ việc vẽ. Kết quả được nhớ đến khi dòng họ có thay đổi. */
  @Get("tree")
  async tree(@CurrentMembership() m: Membership, @Query() query: unknown, @Req() req: Request, @Res() res: Response) {
    const q = treeQuery.parse(query);
    const canSeeHidden = ROLE_RANK[m.role] >= ROLE_RANK.admin;
    const key = ["tree", canSeeHidden ? "admin" : "member", q.rootId ?? "", q.orientation, q.depth ?? "", [...q.collapsed].sort().join(",")].join("|");
    const body = await this.cache.json(m.clanId, key, () =>
      this.db.withClan({ clanId: m.clanId, userId: m.userId }, (trx) => this.builder.build(trx, m.clanId, q, canSeeHidden)),
    );
    // private: chỉ trình duyệt của thành viên giữ, không proxy/CDN nào được lưu
    await sendCached(req, res, body, "private, no-cache");
  }

  /** FR-KIN-01: xưng hô hai chiều giữa hai người */
  @Get("kinship")
  async kinship(@CurrentMembership() m: Membership, @Query() query: unknown) {
    const { a, b } = kinshipQuery.parse(query);
    return this.db.withClan({ clanId: m.clanId, userId: m.userId }, async (trx) => {
      const clan = await trx.selectFrom("clans").select("kinship_variant").where("id", "=", m.clanId).executeTakeFirstOrThrow();
      const { index } = await this.builder.loadGraph(trx, m.clanId);
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
