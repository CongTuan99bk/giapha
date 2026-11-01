import { describe, expect, it } from "vitest";
import { FamilyIndex, kinship } from "../src/index.js";
import { sampleFamily, tree } from "./fixtures.js";

const index = new FamilyIndex(sampleFamily());
const call = (a: string, b: string, variant: "bac" | "nam" = "bac") => kinship(index, a, b, { variant })?.term;

describe("Xưng hô trực hệ (BR-KIN-04)", () => {
  it("cha mẹ, ông bà nội ngoại", () => {
    expect(call("Toi", "Bo")).toBe("bố");
    expect(call("Toi", "Me")).toBe("mẹ");
    expect(call("Toi", "CuTo")).toBe("ông nội");
    expect(call("Toi", "CuBa")).toBe("bà nội");
    expect(call("Toi", "OngNgoai")).toBe("ông ngoại");
    expect(call("Toi", "BaNgoai")).toBe("bà ngoại");
    expect(call("Chau", "CuTo")).toBe("kỵ nội");
  });

  it("con cháu", () => {
    expect(call("Toi", "Con")).toBe("con");
    expect(call("Toi", "Chau")).toBe("cháu nội");
    expect(call("CuTo", "Chau")).toBe("chút nội");
    expect(call("OngNgoai", "Toi")).toBe("cháu ngoại");
  });
});

describe("Anh chị em và vai vế theo nhánh (BR-KIN-02)", () => {
  it("anh chị em ruột theo thứ tự con", () => {
    expect(call("Toi", "Chi")).toBe("chị");
    expect(call("Toi", "Em")).toBe("em");
    expect(call("Em", "Toi")).toBe("anh");
  });

  it("anh họ tính theo nhánh trên, KHÔNG theo tuổi thật", () => {
    // Anh Họ (sinh 1940) nhỏ tuổi hơn Tôi (1938) nhưng là con bác → vẫn là anh họ
    expect(call("Toi", "AnhHo")).toBe("anh họ");
    expect(call("AnhHo", "Toi")).toBe("em họ");
    const r = kinship(index, "Toi", "AnhHo")!;
    expect(r.bIsSenior).toBe(true);
    expect(r.kind).toBe("cousin");
  });

  it("em họ bên nhánh dưới", () => {
    expect(call("Toi", "EmHo")).toBe("em họ");
    expect(call("Toi", "ConCo")).toBe("em họ");
  });
});

describe("Bác, chú, cô, cậu, dì — miền Bắc", () => {
  it("bên nội", () => {
    expect(call("Toi", "BacCa")).toBe("bác");
    expect(call("Toi", "Chu")).toBe("chú");
    expect(call("Toi", "Co")).toBe("cô");
  });
  it("bên ngoại: chị của mẹ gọi bác, em trai của mẹ gọi cậu", () => {
    expect(call("Toi", "BacNgoai")).toBe("bác");
    expect(call("Toi", "Cau")).toBe("cậu");
    expect(kinship(index, "Toi", "Cau")!.side).toBe("ngoại");
  });
  it("ông chú, bà cô, ông bác (anh chị em của ông)", () => {
    expect(call("Con", "Chu")).toBe("ông chú");
    expect(call("Con", "Co")).toBe("bà cô");
    expect(call("Con", "BacCa")).toBe("ông bác");
  });
  it("chiều ngược lại là cháu", () => {
    expect(call("BacCa", "Toi")).toBe("cháu");
    expect(call("Cau", "Toi")).toBe("cháu");
    expect(call("Chi", "Chau")).toBe("cháu");
  });
});

describe("Biến thể miền Nam (FR-KIN-02)", () => {
  it("ba má, chị của mẹ gọi dì, chồng cô gọi dượng", () => {
    expect(call("Toi", "Bo", "nam")).toBe("ba");
    expect(call("Toi", "Me", "nam")).toBe("má");
    expect(call("Toi", "BacNgoai", "nam")).toBe("dì");
    expect(call("Toi", "Cau", "nam")).toBe("cậu");
    expect(call("Toi", "Duong", "nam")).toBe("dượng");
  });
});

describe("Quan hệ qua hôn phối (BR-KIN-05)", () => {
  it("vợ chồng", () => {
    expect(call("Toi", "Vo")).toBe("vợ");
    expect(call("Vo", "Toi")).toBe("chồng");
  });
  it("thím, mợ, bác gái, chồng cô, em dâu, con dâu", () => {
    expect(call("Toi", "Thim")).toBe("thím");
    expect(call("Toi", "Mo")).toBe("mợ");
    expect(call("Toi", "BacGai")).toBe("bác gái");
    expect(call("Toi", "Duong")).toBe("chú");
    expect(call("Toi", "EmDau")).toBe("em dâu");
    expect(call("Toi", "ConDau")).toBe("con dâu");
    expect(kinship(index, "Toi", "Thim")!.viaMarriage).toBe(true);
  });
  it("dâu gọi theo chồng; cha mẹ chồng", () => {
    expect(call("Vo", "Bo")).toBe("bố chồng");
    expect(call("Vo", "Me")).toBe("mẹ chồng");
    expect(call("Vo", "Chu")).toBe("chú");
  });
  it("hai người cùng là dâu: chị dâu", () => {
    // Thím (vợ Chú, con 3) gọi Mẹ (vợ Bố, con 2)
    expect(call("Thim", "Me")).toBe("chị dâu");
  });
});

describe("Các trường hợp biên", () => {
  it("chính mình", () => {
    expect(call("Toi", "Toi")).toBe("chính mình");
  });
  it("không cùng huyết thống trong dữ liệu → null (BR-KIN-06)", () => {
    const t = tree().person("A", "male").person("B", "female");
    expect(kinship(new FamilyIndex(t.graph), "A", "B")).toBeNull();
  });
  it("người không tồn tại → null", () => {
    expect(kinship(index, "Toi", "khong-co")).toBeNull();
  });
  it("trả về đường đi để tô sáng trên cây", () => {
    expect(kinship(index, "Toi", "EmHo")!.path).toEqual(["Toi", "Bo", "CuTo", "Chu", "EmHo"]);
    expect(kinship(index, "Toi", "EmHo")!.commonAncestorId).toBe("CuTo");
  });
  it("con nuôi được tính vai vế như con ruột", () => {
    const t = tree().person("P", "male").person("M", "female");
    t.child("P", "M", "Ruot", "male").child("P", "M", "Nuoi", "male", undefined, "adopted");
    const idx = new FamilyIndex(t.graph);
    expect(kinship(idx, "Nuoi", "Ruot")?.term).toBe("anh");
    expect(kinship(idx, "Nuoi", "P")?.term).toBe("bố");
  });
  it("con riêng không tính huyết thống", () => {
    const t = tree().person("P", "male").person("M", "female");
    t.child("P", "M", "Rieng", "female", undefined, "step");
    expect(kinship(new FamilyIndex(t.graph), "Rieng", "P")).toBeNull();
  });
  it("con của vợ cả xếp trên con của vợ hai dù cùng thứ tự con", () => {
    const t = tree().person("P", "male").person("M", "female").marry("P", "M");
    t.graph.persons.push({ id: "X", gender: "male" }, { id: "Y", gender: "female" });
    t.graph.unions.push({ id: "u2", partnerA: "P", partnerB: null, orderIndex: 2 });
    t.child("P", "M", "X", "male");
    t.graph.children.push({ unionId: "u2", childId: "Y", relation: "biological", birthOrder: 1 });
    const idx = new FamilyIndex(t.graph);
    // X là con vợ cả (hôn phối 1), Y con hôn phối 2 → X vai anh
    expect(kinship(idx, "Y", "X")?.term).toBe("anh");
  });
  it("không đủ dữ liệu để xếp vai → trả cả hai cách gọi", () => {
    const t = tree().person("P", "male");
    t.graph.persons.push({ id: "X", gender: "male" }, { id: "Y", gender: "female" });
    t.graph.unions.push({ id: "a", partnerA: "P", partnerB: null, orderIndex: 1 });
    t.graph.children.push(
      { unionId: "a", childId: "X", relation: "biological", birthOrder: 1 },
      { unionId: "a", childId: "Y", relation: "adopted", birthOrder: 1 },
    );
    const r = kinship(new FamilyIndex(t.graph), "Y", "X")!;
    expect(r.term).toBe("anh/em");
    expect(r.bIsSenior).toBeNull();
  });
});
