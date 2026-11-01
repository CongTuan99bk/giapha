import type { ChildRelation, FamilyGraph, Gender } from "../src/index.js";

/**
 * Trình dựng cây gọn cho test:
 *   const t = tree(); t.person("A", "male", 1900); t.marry("A", "B"); t.child("A", "B", "C", "male");
 */
export function tree() {
  const g: FamilyGraph = { persons: [], unions: [], children: [] };
  let unionSeq = 0;
  const unionOf = (a: string, b: string | null): string => {
    const found = g.unions.find(
      (u) => (u.partnerA === a && u.partnerB === b) || (u.partnerA === b && u.partnerB === a),
    );
    if (found) return found.id;
    const id = `u${++unionSeq}`;
    const order = g.unions.filter((u) => u.partnerA === a).length + 1;
    g.unions.push({ id, partnerA: a, partnerB: b, orderIndex: order });
    return id;
  };
  const api = {
    graph: g,
    person(id: string, gender: Gender, birthYear?: number) {
      g.persons.push({ id, gender, birthYear: birthYear ?? null });
      return api;
    },
    marry(a: string, b: string | null) {
      unionOf(a, b);
      return api;
    },
    /** Thêm con `id` cho cặp (a, b); thứ tự con tự tăng trong cặp. */
    child(a: string, b: string | null, id: string, gender: Gender, birthYear?: number, relation: ChildRelation = "biological") {
      if (!g.persons.some((p) => p.id === id)) api.person(id, gender, birthYear);
      const unionId = unionOf(a, b);
      const order = g.children.filter((c) => c.unionId === unionId).length + 1;
      g.children.push({ unionId, childId: id, relation, birthOrder: order });
      return api;
    },
  };
  return api;
}

/**
 * Cây mẫu 4 đời (miền Bắc):
 *
 *   Cụ Tổ (m) ═ Cụ Bà (f)
 *     ├─ Bác Cả (m, con 1) ═ Bác Gái (f)
 *     │     └─ Anh Họ (m)
 *     ├─ Bố (m, con 2) ═ Mẹ (f)
 *     │     ├─ Chị (f, con 1)
 *     │     ├─ Tôi (m, con 2) ═ Vợ (f)
 *     │     │     └─ Con (m) ── Cháu (f)
 *     │     └─ Em (m, con 3) ═ Em Dâu (f)
 *     ├─ Chú (m, con 3) ═ Thím (f)
 *     │     └─ Em Họ (f)
 *     └─ Cô (f, con 4) ═ Dượng (m)
 *           └─ Con Cô (m)
 *   Ông Ngoại (m) ═ Bà Ngoại (f)
 *     ├─ Bác Ngoại (f, con 1)   (chị của mẹ)
 *     ├─ Mẹ (f, con 2)
 *     └─ Cậu (m, con 3) ═ Mợ (f)
 */
export function sampleFamily() {
  const t = tree();
  t.person("CuTo", "male", 1880).person("CuBa", "female", 1885);
  t.child("CuTo", "CuBa", "BacCa", "male", 1905);
  t.child("CuTo", "CuBa", "Bo", "male", 1910);
  t.child("CuTo", "CuBa", "Chu", "male", 1915);
  t.child("CuTo", "CuBa", "Co", "female", 1918);

  t.person("BacGai", "female", 1908).child("BacCa", "BacGai", "AnhHo", "male", 1940);
  t.person("Me", "female", 1915);
  t.child("Bo", "Me", "Chi", "female", 1935);
  t.child("Bo", "Me", "Toi", "male", 1938);
  t.child("Bo", "Me", "Em", "male", 1942);
  t.person("Thim", "female", 1920).child("Chu", "Thim", "EmHo", "female", 1945);
  t.person("Duong", "male", 1915).child("Co", "Duong", "ConCo", "male", 1944);

  t.person("Vo", "female", 1940).child("Toi", "Vo", "Con", "male", 1962);
  t.person("ConDau", "female", 1965).child("Con", "ConDau", "Chau", "female", 1990);
  t.person("EmDau", "female", 1945).marry("Em", "EmDau");

  t.person("OngNgoai", "male", 1885).person("BaNgoai", "female", 1890);
  t.child("OngNgoai", "BaNgoai", "BacNgoai", "female", 1912);
  t.child("OngNgoai", "BaNgoai", "Me", "female", 1915);
  t.child("OngNgoai", "BaNgoai", "Cau", "male", 1920);
  t.person("Mo", "female", 1925).marry("Cau", "Mo");
  return t.graph;
}
