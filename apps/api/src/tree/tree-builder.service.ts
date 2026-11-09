import { layoutTree } from "@coinguon/genealogy-core";
import { idSchema } from "@coinguon/schemas";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { notFound } from "../common/errors.js";
import { ResponseCache } from "../common/response-cache.js";
import type { Tx } from "../db/database.js";
import { GraphService, type LoadedGraph, type PersonSummaryRow } from "./graph.service.js";

export const treeQuery = z.object({
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

function yearOf(date: unknown): number | null {
  if (date && typeof date === "object" && "year" in date && typeof (date as { year: unknown }).year === "number") {
    return (date as { year: number }).year;
  }
  return null;
}


export type TreeQuery = z.infer<typeof treeQuery>;
/** Phả đồ đã tính bố cục, kèm thông tin hiển thị từng người (đã che người "ẩn thông tin" nếu cần) */
export type BuiltTree = Awaited<ReturnType<TreeBuilder["build"]>>;

/** Dựng phả đồ (bố cục + thông tin hiển thị): dùng chung cho trang phả đồ và bản xuất PDF/SVG */
@Injectable()
export class TreeBuilder {
  constructor(
    private readonly graph: GraphService,
    private readonly cache: ResponseCache,
  ) {}

  /** Cả cây của dòng họ (đọc chung cho phả đồ và xưng hô), nhớ đến khi có thay đổi */
  loadGraph(trx: Tx, clanId: string): Promise<LoadedGraph> {
    return this.cache.memo(clanId, "graph", () => this.graph.load(trx, clanId), { sizeOf: (g) => g.persons.size * 900 });
  }

  async build(trx: Tx, clanId: string, q: TreeQuery, canSeeHidden: boolean) {
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

}
