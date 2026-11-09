import { type PersonCreateInput, personCreateSchema } from "@coinguon/schemas";
import {
  codeKey,
  type ColumnKey,
  type LunarDayMonth,
  parseAnniversary,
  parseDate,
  parseGender,
  parseRelation,
  parseYesNo,
  splitCodes,
} from "./sheet-format.js";
import type { CellError, ReadRow } from "./workbook.js";

/** Người đã có trong dòng họ (để file nhập nối vào) */
export interface ExistingPerson {
  id: string;
  fullName: string;
  gender: "male" | "female" | "unknown";
  inClan: boolean;
  generation: number | null;
}
export interface ExistingUnion {
  id: string;
  a: string;
  b: string | null;
  /** Số thứ tự con lớn nhất hiện có trong cặp này */
  maxChildOrder: number;
}

/** Tham chiếu tới một người: dòng mới trong file, hoặc người đã có */
export type Ref = { kind: "new"; code: string } | { kind: "old"; id: string };
const refKey = (r: Ref) => (r.kind === "new" ? `n:${r.code}` : `o:${r.id}`);

export interface PlannedPerson {
  code: string;
  row: number;
  input: PersonCreateInput;
  /** Ngày giỗ âm lịch ghi riêng (không rõ năm mất) */
  anniversary: LunarDayMonth | null;
}
export interface PlannedUnion {
  key: string;
  a: Ref;
  b: Ref | null;
  /** Dùng lại cặp đã có */
  existingId: string | null;
  orderIndex: number;
}
export interface PlannedLink {
  unionKey: string;
  childCode: string;
  relation: "biological" | "adopted" | "step";
  birthOrder: number;
}
export interface ImportSummary {
  newPeople: number;
  skippedExisting: number;
  newUnions: number;
  links: number;
  deceased: number;
  /** Đời thấp nhất – cao nhất của người mới (ước tính) */
  generations: [number, number] | null;
  rootName: string | null;
}
export interface ImportPlan {
  persons: PlannedPerson[];
  unions: PlannedUnion[];
  links: PlannedLink[];
  /** Mã người mới làm thuỷ tổ (dòng họ chưa có thuỷ tổ) */
  rootCode: string | null;
  summary: ImportSummary;
  errors: CellError[];
  warnings: CellError[];
}

export interface PlanInput {
  rows: ReadRow[];
  existing: Map<string, ExistingPerson>;
  existingUnions: ExistingUnion[];
  clanHasRoot: boolean;
  now?: Date;
}

const FIELD_COLUMN: Record<string, ColumnKey> = {
  fullName: "hoTen",
  gender: "gioiTinh",
  birthDate: "ngaySinh",
  deathDate: "ngayMat",
  isLiving: "daMat",
  otherNames: "tenKhac",
  biography: "tieuSu",
  "facts.birthPlace": "queQuan",
  "facts.occupation": "ngheNghiep",
  "facts.burialPlace": "noiAnTang",
};

interface Parsed {
  row: number;
  code: string;
  person: PlannedPerson;
  father: string | null;
  mother: string | null;
  spouses: string[];
  relation: "biological" | "adopted" | "step";
  order: number | null;
}

export function planImport({ rows, existing, existingUnions, clanHasRoot, now = new Date() }: PlanInput): ImportPlan {
  const errors: CellError[] = [];
  const warnings: CellError[] = [];
  const err = (row: number, column: ColumnKey | null, message: string) => errors.push({ row, column, message });
  const warn = (row: number, column: ColumnKey | null, message: string) => warnings.push({ row, column, message });
  const existingById = new Map([...existing.values()].map((p) => [p.id.toLowerCase(), p]));
  let skippedExisting = 0;

  // ── 1. Đọc từng dòng ──
  const parsed: Parsed[] = [];
  const byCode = new Map<string, Parsed>();
  const firstRowOfCode = new Map<string, number>();
  for (const { row, cells } of rows) {
    const code = (cells.ma ?? "").trim();
    if (!code) {
      err(row, "ma", "Thiếu mã. Mỗi người cần một mã khác nhau (1, 2, 3…)");
      continue;
    }
    if (existingById.has(code.toLowerCase())) {
      // dòng của người đã có (từ file xuất): bỏ qua, không sửa
      skippedExisting++;
      continue;
    }
    const k = codeKey(code);
    if (firstRowOfCode.has(k)) {
      err(row, "ma", `Mã “${code}” trùng với dòng ${firstRowOfCode.get(k)}. Mỗi người một mã khác nhau`);
      continue;
    }
    firstRowOfCode.set(k, row);
    const name = (cells.hoTen ?? "").replace(/\s+/g, " ").trim();
    if (!name) err(row, "hoTen", "Thiếu họ và tên");

    const g = parseGender(cells.gioiTinh);
    if (!g.ok) err(row, "gioiTinh", g.message);
    const birth = parseDate(cells.ngaySinh);
    if (!birth.ok) err(row, "ngaySinh", birth.message);
    const death = parseDate(cells.ngayMat);
    if (!death.ok) err(row, "ngayMat", death.message);
    const gio = parseAnniversary(cells.ngayGio);
    if (!gio.ok) err(row, "ngayGio", gio.message);
    const rel = parseRelation(cells.quanHe);
    if (!rel.ok) err(row, "quanHe", rel.message);
    let order: number | null = null;
    if (cells.thuTu) {
      const n = Number(cells.thuTu);
      if (!Number.isInteger(n) || n < 1 || n > 99) err(row, "thuTu", `Thứ tự con “${cells.thuTu}” — ghi số 1, 2, 3…`);
      else order = n;
    }
    const daMat = parseYesNo(cells.daMat);
    if (cells.daMat && daMat === null) err(row, "daMat", `Cột Đã mất: ghi x nếu đã mất, để trống nếu còn sống`);

    const deathDate = death.ok ? death.value : null;
    const anniversary = gio.ok ? gio.value : null;
    let isLiving = !(deathDate || anniversary || daMat === true);
    if (daMat === false && (deathDate || anniversary)) err(row, "daMat", "Ghi “không” ở cột Đã mất nhưng lại có ngày mất / ngày giỗ");
    const birthDate = birth.ok ? birth.value : null;
    if (isLiving && birthDate && birthDate.year < now.getFullYear() - 110) {
      isLiving = false;
      warn(row, "daMat", `Sinh năm ${birthDate.year} mà chưa ghi đã mất — hiểu là đã mất`);
    }
    if (anniversary && deathDate?.precision === "day") warn(row, "ngayGio", "Đã có ngày mất đủ ngày tháng — ngày giỗ tính theo ngày mất, cột Ngày giỗ được bỏ qua");

    const input = {
      fullName: name,
      gender: g.ok ? g.value : "unknown",
      isLiving,
      birthDate,
      deathDate,
      // ngày giỗ ghi riêng chỉ dùng khi ngày mất không đủ ngày tháng (đủ thì tự tính)
      deathAnniversaryLunar: anniversary && deathDate?.precision !== "day" ? anniversary : null,
      otherNames: splitCodes(cells.tenKhac).map((value) => ({ type: "khac" as const, value })),
      facts: {
        ...(cells.queQuan && { birthPlace: cells.queQuan }),
        ...(cells.ngheNghiep && { occupation: cells.ngheNghiep }),
        ...(cells.noiAnTang && { burialPlace: cells.noiAnTang }),
      },
      biography: cells.tieuSu ? { text: cells.tieuSu } : null,
    };
    const valid = personCreateSchema.safeParse(input);
    if (!valid.success && name) {
      for (const issue of valid.error.issues) {
        const path = issue.path.slice(0, 2).join(".");
        err(row, FIELD_COLUMN[path] ?? FIELD_COLUMN[String(issue.path[0])] ?? null, issue.message);
      }
    }
    const p: Parsed = {
      row,
      code,
      person: { code, row, input: valid.success ? valid.data : (input as PersonCreateInput), anniversary: deathDate?.precision === "day" ? null : anniversary },
      father: cells.maCha?.trim() || null,
      mother: cells.maMe?.trim() || null,
      spouses: splitCodes(cells.maVoChong),
      relation: rel.ok ? rel.value : "biological",
      order,
    };
    parsed.push(p);
    byCode.set(k, p);
  }

  // ── 2. Mã cha, mẹ, vợ/chồng ──
  const resolve = (raw: string, row: number, column: ColumnKey, what: string): Ref | null => {
    const p = byCode.get(codeKey(raw));
    if (p) return { kind: "new", code: p.code };
    const old = existingById.get(raw.toLowerCase());
    if (old) return { kind: "old", id: old.id };
    err(row, column, `${what} “${raw}” không có trong file (và không phải mã người đã có)`);
    return null;
  };
  const genderOf = (r: Ref) => (r.kind === "new" ? byCode.get(codeKey(r.code))!.person.input.gender : existingById.get(r.id.toLowerCase())!.gender);
  const nameOf = (r: Ref) => (r.kind === "new" ? byCode.get(codeKey(r.code))!.person.input.fullName : existingById.get(r.id.toLowerCase())!.fullName);
  const rowOf = (r: Ref) => (r.kind === "new" ? byCode.get(codeKey(r.code))!.row : 0);
  const same = (a: Ref, b: Ref) => refKey(a) === refKey(b);

  const fatherOf = new Map<string, Ref>();
  const motherOf = new Map<string, Ref>();
  for (const p of parsed) {
    const self: Ref = { kind: "new", code: p.code };
    if (p.father) {
      const f = resolve(p.father, p.row, "maCha", "Mã cha");
      if (f && same(f, self)) err(p.row, "maCha", "Mã cha trùng với chính người này");
      else if (f && genderOf(f) === "female") err(p.row, "maCha", `Mã cha “${p.father}” là ${nameOf(f)} (nữ) — có phải Mã mẹ?`);
      else if (f) fatherOf.set(p.code, f);
    }
    if (p.mother) {
      const m = resolve(p.mother, p.row, "maMe", "Mã mẹ");
      if (m && same(m, self)) err(p.row, "maMe", "Mã mẹ trùng với chính người này");
      else if (m && genderOf(m) === "male") err(p.row, "maMe", `Mã mẹ “${p.mother}” là ${nameOf(m)} (nam) — có phải Mã cha?`);
      else if (m) motherOf.set(p.code, m);
    }
  }

  // ── 3. Vòng lặp tổ tiên (A là cha của B, B lại là tổ tiên của A) ──
  const state = new Map<string, 1 | 2>();
  const visit = (code: string, path: string[]): void => {
    const s = state.get(code);
    if (s === 2) return;
    if (s === 1) {
      const p = byCode.get(codeKey(code))!;
      err(p.row, "maCha", `Vòng lặp tổ tiên: ${[...path.slice(path.indexOf(code)), code].join(" → ")} (một người không thể là tổ tiên của chính mình)`);
      return;
    }
    state.set(code, 1);
    for (const par of [fatherOf.get(code), motherOf.get(code)]) if (par?.kind === "new") visit(par.code, [...path, code]);
    state.set(code, 2);
  };
  for (const p of parsed) visit(p.code, []);

  // ── 4. Vợ chồng ──
  const hasParents = (r: Ref) =>
    r.kind === "new" ? fatherOf.has(r.code) || motherOf.has(r.code) : Boolean(existingById.get(r.id.toLowerCase())?.inClan);
  /** Người "của dòng họ" đứng trước (partner_a): có cha mẹ trong họ; ngang nhau thì nam trước, dòng trên trước */
  const orderPair = (x: Ref, y: Ref): [Ref, Ref] => {
    const sx = [hasParents(x) ? 0 : 1, genderOf(x) === "male" ? 0 : 1, rowOf(x)];
    const sy = [hasParents(y) ? 0 : 1, genderOf(y) === "male" ? 0 : 1, rowOf(y)];
    for (let i = 0; i < 3; i++) if (sx[i] !== sy[i]) return sx[i]! < sy[i]! ? [x, y] : [y, x];
    return [x, y];
  };
  const pairKey = (x: Ref, y: Ref | null) => (y ? [refKey(x), refKey(y)].sort().join("+") : `${refKey(x)}+0`);
  const unions = new Map<string, PlannedUnion & { rank: number }>();
  // cặp đã có
  for (const u of existingUnions) {
    const a: Ref = { kind: "old", id: u.a };
    const b: Ref | null = u.b ? { kind: "old", id: u.b } : null;
    unions.set(pairKey(a, b), { key: `u:${u.id}`, a, b, existingId: u.id, orderIndex: 0, rank: 0 });
  }
  const unionsOf = (r: Ref) => [...unions.values()].filter((u) => same(u.a, r) || (u.b && same(u.b, r)));
  const addPair = (x: Ref, y: Ref, rank: number) => {
    const k = pairKey(x, y);
    if (unions.has(k)) return unions.get(k)!;
    const [a, b] = orderPair(x, y);
    const u = { key: `n:${k}`, a, b, existingId: null, orderIndex: 0, rank };
    unions.set(k, u);
    return u;
  };
  for (const p of parsed) {
    const self: Ref = { kind: "new", code: p.code };
    p.spouses.forEach((raw, i) => {
      const s = resolve(raw, p.row, "maVoChong", "Mã vợ/chồng");
      if (!s) return;
      if (same(s, self)) return err(p.row, "maVoChong", "Mã vợ/chồng trùng với chính người này");
      addPair(self, s, p.row * 100 + i);
    });
  }

  // ── 5. Con thuộc cặp cha mẹ nào ──
  const childUnion = new Map<string, string>();
  // con có đủ cha và mẹ trước (có thể tạo thêm cặp vợ chồng chưa ghi)
  for (const p of parsed) {
    const f = fatherOf.get(p.code);
    const m = motherOf.get(p.code);
    if (f && m) childUnion.set(p.code, addPair(f, m, 1e9 + p.row).key);
  }
  for (const p of parsed) {
    if (childUnion.has(p.code)) continue;
    const parent = fatherOf.get(p.code) ?? motherOf.get(p.code);
    if (!parent) continue;
    const column: ColumnKey = fatherOf.has(p.code) ? "maMe" : "maCha";
    const list = unionsOf(parent);
    if (list.length === 1) childUnion.set(p.code, list[0]!.key);
    else if (list.length === 0) {
      const k = pairKey(parent, null);
      const u = unions.get(k) ?? { key: `n:${k}`, a: parent, b: null, existingId: null, orderIndex: 0, rank: 2e9 };
      unions.set(k, u);
      childUnion.set(p.code, u.key);
    } else {
      err(p.row, column, `${nameOf(parent)} có ${list.length} vợ/chồng — điền ${column === "maMe" ? "Mã mẹ" : "Mã cha"} để biết là con của ai`);
    }
  }

  // thứ tự vợ/chồng của mỗi người (vợ cả, vợ hai…)
  const newUnions = [...unions.values()].filter((u) => !u.existingId);
  const existingCount = new Map<string, number>();
  for (const u of existingUnions) existingCount.set(`o:${u.a}`, (existingCount.get(`o:${u.a}`) ?? 0) + 1);
  const byA = new Map<string, typeof newUnions>();
  for (const u of newUnions) (byA.get(refKey(u.a)) ?? byA.set(refKey(u.a), []).get(refKey(u.a))!).push(u);
  for (const [a, list] of byA) {
    list.sort((x, y) => x.rank - y.rank);
    list.forEach((u, i) => (u.orderIndex = (existingCount.get(a) ?? 0) + i + 1));
  }

  // thứ tự con trong mỗi cặp: con đã có giữ nguyên, con mới xếp sau theo "Thứ tự con" rồi theo dòng
  const maxOrder = new Map(existingUnions.map((u) => [`u:${u.id}`, u.maxChildOrder]));
  const kids = new Map<string, Parsed[]>();
  for (const p of parsed) {
    const k = childUnion.get(p.code);
    if (k) (kids.get(k) ?? kids.set(k, []).get(k)!).push(p);
  }
  const links: PlannedLink[] = [];
  for (const [unionKey, list] of kids) {
    list.sort((x, y) => (x.order ?? 1e6) - (y.order ?? 1e6) || x.row - y.row);
    const seen = new Map<number, number>();
    for (const c of list) {
      if (c.order !== null && seen.has(c.order)) warn(c.row, "thuTu", `Thứ tự con ${c.order} trùng với dòng ${seen.get(c.order)} (cùng cha mẹ)`);
      if (c.order !== null) seen.set(c.order, c.row);
    }
    list.forEach((c, i) => links.push({ unionKey, childCode: c.code, relation: c.relation, birthOrder: (maxOrder.get(unionKey) ?? 0) + i + 1 }));
  }

  // ── 6. Mọi người mới phải nối được vào cây ──
  let rootCode: string | null = null;
  const attached = new Set<string>();
  const children = new Map<string, string[]>();
  for (const p of parsed) {
    for (const par of [fatherOf.get(p.code), motherOf.get(p.code)]) {
      if (par) (children.get(refKey(par)) ?? children.set(refKey(par), []).get(refKey(par))!).push(refKey({ kind: "new", code: p.code }));
    }
  }
  const spouseLinks = new Map<string, string[]>();
  for (const u of unions.values()) {
    if (!u.b) continue;
    const a = refKey(u.a);
    const b = refKey(u.b);
    (spouseLinks.get(a) ?? spouseLinks.set(a, []).get(a)!).push(b);
    (spouseLinks.get(b) ?? spouseLinks.set(b, []).get(b)!).push(a);
  }
  const queue: string[] = [];
  const mark = (k: string) => {
    if (!attached.has(k)) {
      attached.add(k);
      queue.push(k);
    }
  };
  const parentless = parsed.filter((p) => !fatherOf.has(p.code) && !motherOf.has(p.code) && !p.father && !p.mother);
  if (!clanHasRoot && parsed.length > 0) {
    // thuỷ tổ: người không cha mẹ, có con trong file, nam trước, dòng trên trước
    const root = [...parentless].sort(
      (x, y) =>
        Number(!children.has(`n:${x.code}`)) - Number(!children.has(`n:${y.code}`)) ||
        Number(x.person.input.gender !== "male") - Number(y.person.input.gender !== "male") ||
        x.row - y.row,
    )[0];
    if (root) {
      rootCode = root.code;
      mark(`n:${root.code}`);
    } else if (errors.length === 0) {
      err(parsed[0]!.row, "maCha", "Không tìm thấy thuỷ tổ: ai cũng có cha mẹ — kiểm tra lại Mã cha, Mã mẹ");
    }
  }
  for (const p of existing.values()) mark(`o:${p.id}`);
  while (queue.length) {
    const k = queue.shift()!;
    for (const c of children.get(k) ?? []) mark(c);
    for (const s of spouseLinks.get(k) ?? []) mark(s);
  }
  const rootRow = rootCode ? byCode.get(codeKey(rootCode)) : null;
  for (const p of parsed) {
    if (attached.has(`n:${p.code}`)) continue;
    // lỗi cha mẹ đã báo ở trên thì thôi báo thêm
    if (p.father || p.mother) {
      if (!errors.some((e) => e.row === p.row)) err(p.row, "maCha", "Chưa nối được vào cây: tổ tiên của người này không nối vào thuỷ tổ");
      continue;
    }
    err(
      p.row,
      "ma",
      clanHasRoot
        ? `${p.person.input.fullName} chưa nối vào phả đã có: không có cha mẹ, vợ chồng. Điền Mã cha / Mã mẹ (mã người đã có, lấy từ “Xuất danh sách Excel”)`
        : `${p.person.input.fullName} chưa nối vào cây: không có cha mẹ, không là vợ/chồng của ai trong cây. Phả chỉ có một thuỷ tổ${rootRow ? ` (${rootRow.person.input.fullName}, dòng ${rootRow.row})` : ""}`,
    );
  }

  // ── 7. Tóm tắt: đời ước tính ──
  const gen = new Map<string, number>();
  const genOf = (k: string, depth = 0): number | null => {
    if (gen.has(k)) return gen.get(k)!;
    if (depth > 200) return null;
    if (k.startsWith("o:")) return existing.get(k.slice(2))?.generation ?? existingById.get(k.slice(2).toLowerCase())?.generation ?? null;
    const code = k.slice(2);
    const par = fatherOf.get(code) ?? motherOf.get(code);
    let g: number | null = null;
    if (par) {
      const pg = genOf(refKey(par), depth + 1);
      g = pg === null ? null : pg + 1;
    } else if (code === rootCode) g = 1;
    else {
      for (const s of spouseLinks.get(k) ?? []) {
        const sp = s.startsWith("n:") && !fatherOf.has(s.slice(2)) && !motherOf.has(s.slice(2)) && s.slice(2) !== rootCode ? null : genOf(s, depth + 1);
        if (sp !== null) {
          g = sp;
          break;
        }
      }
    }
    if (g !== null) gen.set(k, g);
    return g;
  };
  const gens = parsed.map((p) => genOf(`n:${p.code}`)).filter((g): g is number => g !== null);

  const sortErr = (a: CellError, b: CellError) => a.row - b.row;
  return {
    persons: parsed.map((p) => p.person),
    unions: newUnions.map(({ rank: _rank, ...u }) => u),
    links,
    rootCode,
    summary: {
      newPeople: parsed.length,
      skippedExisting,
      newUnions: newUnions.filter((u) => u.b).length,
      links: links.length,
      deceased: parsed.filter((p) => !p.person.input.isLiving).length,
      generations: gens.length ? [Math.min(...gens), Math.max(...gens)] : null,
      rootName: rootRow?.person.input.fullName ?? null,
    },
    errors: errors.sort(sortErr),
    warnings: warnings.sort(sortErr),
  };
}
