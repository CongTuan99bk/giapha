import { computeLineage, FamilyIndex, type FamilyGraph, type Gender } from "@coinguon/genealogy-core";
import { Injectable } from "@nestjs/common";
import { sql } from "kysely";
import type { Tx } from "../db/database.js";

export interface PersonSummaryRow {
  id: string;
  full_name: string;
  gender: Gender;
  birth_year: number | null;
  is_living: boolean;
  generation: number | null;
  in_clan: boolean;
  lineage_path: string | null;
  privacy: "public" | "members" | "hidden";
  avatar_media_id: string | null;
  death_date: unknown;
}

export interface LoadedGraph {
  graph: FamilyGraph;
  index: FamilyIndex;
  persons: Map<string, PersonSummaryRow>;
}

/**
 * Nạp cây phả hệ của dòng họ hiện tại (RLS đã lọc theo app.clan_id) và
 * tính lại đời / thuộc họ / đường dẫn nhánh sau mỗi thay đổi quan hệ.
 */
@Injectable()
export class GraphService {
  async load(trx: Tx, clanId: string): Promise<LoadedGraph> {
    const [persons, unions, links] = await Promise.all([
      trx
        .selectFrom("persons")
        .select([
          "id",
          "full_name",
          "gender",
          "birth_year",
          "is_living",
          "generation",
          "in_clan",
          "lineage_path",
          "privacy",
          "avatar_media_id",
          "death_date",
        ])
        .where("clan_id", "=", clanId)
        .where("deleted_at", "is", null)
        .execute(),
      trx
        .selectFrom("unions")
        .select(["id", "partner_a_id", "partner_b_id", "order_index"])
        .where("clan_id", "=", clanId)
        .where("deleted_at", "is", null)
        .execute(),
      trx
        .selectFrom("parent_child")
        .select(["union_id", "child_id", "relation", "birth_order"])
        .where("clan_id", "=", clanId)
        .execute(),
    ]);
    const personMap = new Map(persons.map((p) => [p.id, p as PersonSummaryRow]));
    const graph: FamilyGraph = {
      persons: persons.map((p) => ({ id: p.id, gender: p.gender, birthYear: p.birth_year })),
      unions: unions
        .filter((u) => personMap.has(u.partner_a_id))
        .map((u) => ({
          id: u.id,
          partnerA: u.partner_a_id,
          partnerB: u.partner_b_id && personMap.has(u.partner_b_id) ? u.partner_b_id : null,
          orderIndex: u.order_index,
        })),
      children: links
        .filter((l) => personMap.has(l.child_id))
        .map((l) => ({ unionId: l.union_id, childId: l.child_id, relation: l.relation, birthOrder: l.birth_order })),
    };
    return { graph, index: new FamilyIndex(graph), persons: personMap };
  }

  /** Tính lại generation, in_clan, lineage_path; chỉ ghi các dòng thay đổi. Trả về số dòng cập nhật. */
  async recomputeLineage(trx: Tx, clanId: string): Promise<number> {
    const clan = await trx
      .selectFrom("clans")
      .select(["root_person_id", "lineage_mode"])
      .where("id", "=", clanId)
      .executeTakeFirstOrThrow();
    const { index, persons } = await this.load(trx, clanId);
    const lineage = clan.root_person_id
      ? computeLineage(index, clan.root_person_id, { mode: clan.lineage_mode })
      : new Map();

    const changed: Array<{ id: string; generation: number | null; inClan: boolean; path: string | null }> = [];
    for (const p of persons.values()) {
      const info = lineage.get(p.id);
      const next = {
        generation: info?.generation ?? null,
        inClan: info ? info.inClan : true,
        path: info?.path ?? null,
      };
      if (next.generation !== p.generation || next.inClan !== p.in_clan || next.path !== p.lineage_path) {
        changed.push({ id: p.id, ...next });
      }
    }
    if (changed.length === 0) return 0;

    for (let i = 0; i < changed.length; i += 1000) {
      const chunk = changed.slice(i, i + 1000);
      const values = sql.join(
        chunk.map((c) => sql`(${c.id}::uuid, ${c.generation}::int, ${c.inClan}::boolean, ${c.path}::ltree)`),
      );
      await sql`
        update persons as p
        set generation = v.generation, in_clan = v.in_clan, lineage_path = v.path
        from (values ${values}) as v(id, generation, in_clan, path)
        where p.id = v.id`.execute(trx);
    }
    return changed.length;
  }
}
