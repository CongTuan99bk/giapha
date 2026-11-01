import { describe, expect, it } from "vitest";
import { FamilyIndex, layoutTree, type FamilyGraph, type LayoutNode } from "../src/index.js";
import { sampleFamily } from "./fixtures.js";

function overlaps(a: LayoutNode, b: LayoutNode): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function assertNoOverlap(nodes: LayoutNode[]): void {
  const byRow = new Map<number, LayoutNode[]>();
  for (const n of nodes) byRow.set(n.y, [...(byRow.get(n.y) ?? []), n]);
  for (const row of byRow.values()) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) expect(overlaps(row[i - 1]!, row[i]!)).toBe(false);
  }
}

/** Cây giả lập: mỗi người có vợ và tối đa 3 con, đủ `size` người. */
function bigTree(size: number): FamilyGraph {
  const g: FamilyGraph = { persons: [{ id: "p0", gender: "male" }], unions: [], children: [] };
  let next = 1;
  for (let head = 0; head < g.persons.length && next < size; head++) {
    const p = g.persons[head]!;
    if (p.id.startsWith("s")) continue;
    const spouse = `s${next++}`;
    g.persons.push({ id: spouse, gender: "female" });
    const unionId = `u${head}`;
    g.unions.push({ id: unionId, partnerA: p.id, partnerB: spouse, orderIndex: 1 });
    const kids = 1 + (head % 3);
    for (let k = 1; k <= kids && next < size; k++) {
      const id = `p${next++}`;
      g.persons.push({ id, gender: k % 2 === 1 ? "male" : "female" });
      g.children.push({ unionId, childId: id, relation: "biological", birthOrder: k });
    }
  }
  return g;
}

describe("Bố cục phả đồ", () => {
  const index = new FamilyIndex(sampleFamily());

  it("vẽ đủ hậu duệ và vợ/chồng của thuỷ tổ, không vẽ bên ngoại", () => {
    const layout = layoutTree(index, { rootId: "CuTo" });
    const ids = layout.nodes.map((n) => n.personId);
    for (const id of ["CuTo", "CuBa", "Bo", "Me", "Toi", "Vo", "Chau", "EmDau", "Duong", "ConCo"]) {
      expect(ids).toContain(id);
    }
    expect(ids).not.toContain("OngNgoai");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("không có hai ô chồng lên nhau", () => {
    assertNoOverlap(layoutTree(index, { rootId: "CuTo" }).nodes);
  });

  it("mỗi đời một hàng; con nằm dưới cha mẹ", () => {
    const layout = layoutTree(index, { rootId: "CuTo", nodeHeight: 70, levelGap: 50 });
    const y = (id: string) => layout.nodes.find((n) => n.personId === id)!.y;
    expect(y("CuTo")).toBe(0);
    expect(y("Bo")).toBe(120);
    expect(y("Toi")).toBe(240);
    expect(y("Vo")).toBe(y("Toi"));
  });

  it("thứ tự con từ trái sang phải đúng thứ tự trưởng – thứ", () => {
    const layout = layoutTree(index, { rootId: "CuTo" });
    const x = (id: string) => layout.nodes.find((n) => n.personId === id)!.x;
    expect(x("BacCa")).toBeLessThan(x("Bo"));
    expect(x("Bo")).toBeLessThan(x("Chu"));
    expect(x("Chu")).toBeLessThan(x("Co"));
  });

  it("mỗi con có một đường nối từ cặp cha mẹ", () => {
    const layout = layoutTree(index, { rootId: "CuTo" });
    const childIds = layout.edges.map((e) => e.childId).sort();
    expect(childIds).toContain("Toi");
    expect(layout.edges.every((e) => e.points.length === 4)).toBe(true);
  });

  it("thu gọn nhánh ẩn hậu duệ và đánh dấu có con bị ẩn", () => {
    const layout = layoutTree(index, { rootId: "CuTo", collapsed: new Set(["Bo"]) });
    const ids = layout.nodes.map((n) => n.personId);
    expect(ids).not.toContain("Toi");
    expect(layout.nodes.find((n) => n.personId === "Bo")!.hasHiddenChildren).toBe(true);
  });

  it("giới hạn số đời", () => {
    const layout = layoutTree(index, { rootId: "CuTo", maxDepth: 2 });
    expect(Math.max(...layout.nodes.map((n) => n.depth))).toBe(1);
  });

  it("xem từ một người bất kỳ làm gốc", () => {
    const layout = layoutTree(index, { rootId: "Toi" });
    expect(layout.nodes.map((n) => n.personId).sort()).toEqual(["Chau", "Con", "ConDau", "Toi", "Vo"]);
  });

  it("hướng ngang hoán đổi trục", () => {
    const v = layoutTree(index, { rootId: "CuTo" });
    const h = layoutTree(index, { rootId: "CuTo", orientation: "horizontal" });
    expect(h.width).toBeGreaterThan(0);
    const hb = h.nodes.find((n) => n.personId === "Bo")!;
    expect(hb.x).toBeGreaterThan(0);
    expect(v.nodes.find((n) => n.personId === "CuTo")!.y).toBe(0);
    expect(h.nodes.find((n) => n.personId === "CuTo")!.x).toBe(0);
  });

  it("gốc không tồn tại → bố cục rỗng", () => {
    expect(layoutTree(index, { rootId: "khong-co" }).nodes).toEqual([]);
  });

  it("cây 20.000 người: không chồng ô, chạy dưới 1 giây (NFR-PERF-01)", () => {
    const big = new FamilyIndex(bigTree(20_000));
    const t0 = performance.now();
    const layout = layoutTree(big, { rootId: "p0" });
    const ms = performance.now() - t0;
    expect(layout.nodes).toHaveLength(20_000);
    assertNoOverlap(layout.nodes);
    expect(ms).toBeLessThan(1000);
  });
});
