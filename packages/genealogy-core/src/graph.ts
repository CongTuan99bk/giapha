import type { ChildEdge, FamilyGraph, PersonNode, UnionEdge } from "./types.js";

const RELATION_RANK = { biological: 0, adopted: 1, step: 2 } as const;

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Chỉ mục tra cứu nhanh trên một cây phả hệ (O(1) cho mọi truy vấn quan hệ trực tiếp).
 * Không sửa dữ liệu đầu vào; tạo lại khi cây thay đổi.
 */
export class FamilyIndex {
  readonly graph: FamilyGraph;
  private readonly personById = new Map<string, PersonNode>();
  private readonly unionById = new Map<string, UnionEdge>();
  private readonly unionsByPerson = new Map<string, UnionEdge[]>();
  private readonly childEdgesByUnion = new Map<string, ChildEdge[]>();
  private readonly parentEdgesByChild = new Map<string, ChildEdge[]>();

  constructor(graph: FamilyGraph) {
    this.graph = graph;
    for (const p of graph.persons) this.personById.set(p.id, p);
    for (const u of graph.unions) {
      this.unionById.set(u.id, u);
      pushTo(this.unionsByPerson, u.partnerA, u);
      if (u.partnerB !== null && u.partnerB !== u.partnerA) pushTo(this.unionsByPerson, u.partnerB, u);
    }
    for (const c of graph.children) {
      pushTo(this.childEdgesByUnion, c.unionId, c);
      pushTo(this.parentEdgesByChild, c.childId, c);
    }
    for (const list of this.unionsByPerson.values()) list.sort((a, b) => a.orderIndex - b.orderIndex);
    for (const list of this.childEdgesByUnion.values()) list.sort((a, b) => a.birthOrder - b.birthOrder);
    for (const list of this.parentEdgesByChild.values()) {
      list.sort((a, b) => RELATION_RANK[a.relation] - RELATION_RANK[b.relation]);
    }
  }

  has(id: string): boolean {
    return this.personById.has(id);
  }

  person(id: string): PersonNode | undefined {
    return this.personById.get(id);
  }

  union(id: string): UnionEdge | undefined {
    return this.unionById.get(id);
  }

  /** Các hôn phối của một người, theo thứ tự (vợ cả trước). */
  unionsOf(personId: string): readonly UnionEdge[] {
    return this.unionsByPerson.get(personId) ?? [];
  }

  /** Người còn lại trong hôn phối, null nếu không rõ. */
  partnerIn(union: UnionEdge, personId: string): string | null {
    return union.partnerA === personId ? union.partnerB : union.partnerA;
  }

  spousesOf(personId: string): string[] {
    const result: string[] = [];
    for (const u of this.unionsOf(personId)) {
      const p = this.partnerIn(u, personId);
      if (p !== null && !result.includes(p)) result.push(p);
    }
    return result;
  }

  /** Hai người có chung một hôn phối không. */
  areSpouses(a: string, b: string): boolean {
    return this.unionsOf(a).some((u) => this.partnerIn(u, a) === b);
  }

  childEdgesOfUnion(unionId: string): readonly ChildEdge[] {
    return this.childEdgesByUnion.get(unionId) ?? [];
  }

  /** Con của một người qua mọi hôn phối, theo thứ tự hôn phối rồi thứ tự con. */
  childEdgesOf(personId: string): ChildEdge[] {
    const result: ChildEdge[] = [];
    for (const u of this.unionsOf(personId)) result.push(...this.childEdgesOfUnion(u.id));
    return result;
  }

  parentEdgesOf(childId: string): readonly ChildEdge[] {
    return this.parentEdgesByChild.get(childId) ?? [];
  }

  /**
   * Cha mẹ tính vai vế (ruột + nuôi, không tính quan hệ con riêng).
   * Cha (nam) đứng trước để đường tìm tổ tiên ưu tiên bên nội.
   */
  parentsOf(childId: string): string[] {
    const result: string[] = [];
    for (const edge of this.parentEdgesOf(childId)) {
      if (edge.relation === "step") continue;
      const u = this.unionById.get(edge.unionId);
      if (!u) continue;
      for (const p of [u.partnerA, u.partnerB]) {
        if (p !== null && p !== childId && !result.includes(p)) result.push(p);
      }
    }
    return result.sort((a, b) => genderRank(this.person(a)) - genderRank(this.person(b)));
  }

  /** Con tính vai vế của một người (ruột + nuôi). */
  childrenOf(personId: string): string[] {
    return this.childEdgesOf(personId)
      .filter((e) => e.relation !== "step")
      .map((e) => e.childId);
  }

  /** Cạnh cha mẹ → con của `childId` thuộc hôn phối có `parentId`, nếu có. */
  edgeUnder(childId: string, parentId: string): ChildEdge | undefined {
    return this.parentEdgesOf(childId).find((e) => {
      if (e.relation === "step") return false;
      const u = this.unionById.get(e.unionId);
      return u !== undefined && (u.partnerA === parentId || u.partnerB === parentId);
    });
  }
}

function genderRank(p: PersonNode | undefined): number {
  if (!p) return 3;
  return p.gender === "male" ? 0 : p.gender === "female" ? 1 : 2;
}
