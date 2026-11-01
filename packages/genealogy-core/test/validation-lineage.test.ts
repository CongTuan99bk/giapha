import { describe, expect, it } from "vitest";
import { computeLineage, FamilyIndex, isAncestor, validateGraph, wouldCreateCycle } from "../src/index.js";
import { sampleFamily, tree } from "./fixtures.js";

describe("Kiểm tra hợp lệ", () => {
  it("cây mẫu không có lỗi", () => {
    expect(validateGraph(sampleFamily()).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("chặn tạo vòng lặp tổ tiên (BR-TREE-02)", () => {
    const idx = new FamilyIndex(sampleFamily());
    expect(isAncestor(idx, "CuTo", "Chau")).toBe(true);
    expect(isAncestor(idx, "Chau", "CuTo")).toBe(false);
    // gắn Cụ Tổ làm con của Cháu → vòng lặp
    expect(wouldCreateCycle(idx, "CuTo", ["Chau"])).toBe(true);
    expect(wouldCreateCycle(idx, "Toi", ["Toi"])).toBe(true);
    expect(wouldCreateCycle(idx, "Chau", ["Toi"])).toBe(false);
  });

  it("phát hiện vòng lặp đã có trong dữ liệu nhập", () => {
    const t = tree().person("A", "male").person("B", "female");
    t.child("A", "B", "C", "male").child("C", null, "A", "male");
    const issues = validateGraph(t.graph);
    expect(issues.some((i) => i.code === "ANCESTOR_CYCLE")).toBe(true);
  });

  it("hai cặp cha mẹ ruột (BR-TREE-01), trùng thứ tự con (BR-TREE-05)", () => {
    const t = tree().person("A", "male").person("B", "female").person("D", "male").person("E", "female");
    t.child("A", "B", "C", "male").child("D", "E", "C", "male");
    t.graph.children.push({ unionId: "u1", childId: "D", relation: "biological", birthOrder: 1 });
    const codes = validateGraph(t.graph).map((i) => i.code);
    expect(codes).toContain("MULTIPLE_BIOLOGICAL_PARENTS");
    expect(codes).toContain("DUPLICATE_BIRTH_ORDER");
  });

  it("tham chiếu hỏng, hôn phối với chính mình, hôn phối trùng", () => {
    const t = tree().person("A", "male");
    t.graph.unions.push(
      { id: "x1", partnerA: "A", partnerB: "khong-co", orderIndex: 1 },
      { id: "x2", partnerA: "A", partnerB: "A", orderIndex: 2 },
      { id: "x3", partnerA: "khong-co", partnerB: "A", orderIndex: 1 },
    );
    t.graph.children.push({ unionId: "khong-co", childId: "A", relation: "biological", birthOrder: 1 });
    const codes = validateGraph(t.graph).map((i) => i.code);
    expect(codes).toContain("DANGLING_REFERENCE");
    expect(codes).toContain("SELF_UNION");
    expect(codes).toContain("DUPLICATE_UNION");
  });

  it("cha mẹ sinh sau con chỉ là cảnh báo (BR-TREE-03)", () => {
    const t = tree().person("A", "male", 1950).person("B", "female", 1952);
    t.child("A", "B", "C", "male", 1940);
    const issues = validateGraph(t.graph);
    expect(issues.every((i) => i.severity === "warning")).toBe(true);
    expect(issues.filter((i) => i.code === "CHILD_BORN_BEFORE_PARENT")).toHaveLength(2);
  });
});

describe("Đời, dòng họ, đường dẫn nhánh (BR-TREE-04)", () => {
  const idx = new FamilyIndex(sampleFamily());
  const lin = computeLineage(idx, "CuTo");

  it("thuỷ tổ đời 1, con = đời cha + 1", () => {
    expect(lin.get("CuTo")?.generation).toBe(1);
    expect(lin.get("Bo")?.generation).toBe(2);
    expect(lin.get("Toi")?.generation).toBe(3);
    expect(lin.get("Chau")?.generation).toBe(5);
  });

  it("vợ/chồng ngoài họ mang đời của người trong họ", () => {
    expect(lin.get("Vo")).toMatchObject({ generation: 3, isSpouse: true, inClan: false, path: null });
    expect(lin.get("Me")).toMatchObject({ generation: 2, isSpouse: true });
  });

  it("tính theo cha: con của con gái không mang họ", () => {
    expect(lin.get("EmHo")?.inClan).toBe(true);
    expect(lin.get("ConCo")).toMatchObject({ generation: 3, inClan: false });
    expect(lin.get("Chau")?.inClan).toBe(true);
  });

  it("tính theo mẹ: ngược lại", () => {
    const m = computeLineage(idx, "CuBa", { mode: "matrilineal" });
    expect(m.get("ConCo")?.inClan).toBe(true);
    expect(m.get("AnhHo")?.inClan).toBe(false);
  });

  it("đường dẫn nhánh theo thứ tự con", () => {
    expect(lin.get("BacCa")?.path).toBe("1.1");
    expect(lin.get("Bo")?.path).toBe("1.2");
    expect(lin.get("Toi")?.path).toBe("1.2.2");
    expect(lin.get("Con")?.path).toBe("1.2.2.1");
  });

  it("người không nối với thuỷ tổ không có trong kết quả", () => {
    expect(lin.has("OngNgoai")).toBe(false);
    expect(computeLineage(idx, "khong-co").size).toBe(0);
  });

  it("con riêng: có đời nhưng không thuộc họ, không có đường dẫn", () => {
    const t = tree().person("A", "male").person("B", "female");
    t.child("A", "B", "R", "male", undefined, "step");
    const r = computeLineage(new FamilyIndex(t.graph), "A").get("R");
    expect(r).toMatchObject({ generation: 2, inClan: false, isStepChild: true, path: null });
  });

  it("hôn nhân trong họ: người vừa là dâu vừa là hậu duệ được tính là hậu duệ", () => {
    const t = tree().person("A", "male").person("B", "female");
    t.child("A", "B", "S1", "male").child("A", "B", "S2", "female");
    t.child("S2", null, "X", "female");
    t.child("S1", "X", "Y", "male");
    const l = computeLineage(new FamilyIndex(t.graph), "A");
    expect(l.get("X")).toMatchObject({ generation: 3, isSpouse: false, path: "1.2.1" });
    // Y = đời cha (S1, đời 2) + 1
    expect(l.get("Y")?.generation).toBe(3);
  });
});
