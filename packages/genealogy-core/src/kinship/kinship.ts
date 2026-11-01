import type { FamilyIndex } from "../graph.js";
import type { Gender } from "../types.js";
import { KINSHIP_TERMS, type KinshipTerms, type KinshipVariant } from "./terms.js";

export type KinshipKind =
  | "self"
  | "spouse"
  | "ancestor"
  | "descendant"
  | "sibling"
  | "cousin"
  | "elder-collateral"
  | "younger-collateral"
  | "in-law";

export interface KinshipResult {
  /** Cách A gọi B, ví dụ "chú", "bà ngoại", "anh họ" */
  term: string;
  kind: KinshipKind;
  /** Bên nội/ngoại của A (theo cha hay mẹ của A trên đường quan hệ) */
  side: "nội" | "ngoại" | null;
  /** > 0: B ở đời trên A; < 0: B ở đời dưới; 0: cùng đời */
  generationGap: number;
  /** B thuộc nhánh trên A tại điểm rẽ (vai anh/chị) — null nếu không áp dụng hoặc thiếu dữ liệu */
  bIsSenior: boolean | null;
  /** Tổ tiên chung gần nhất (với quan hệ huyết thống) */
  commonAncestorId: string | null;
  /** Đường đi A → … → B (id) để tô sáng trên phả đồ */
  path: string[];
  /** Quan hệ suy ra qua hôn phối (dâu, rể, theo chồng/vợ) */
  viaMarriage: boolean;
}

export interface KinshipOptions {
  variant?: KinshipVariant;
}

interface BloodRelation {
  lca: string;
  /** [a, cha/mẹ của a, …, lca] */
  pathA: string[];
  /** [b, …, lca] */
  pathB: string[];
}

/**
 * Tra cách A gọi B (FR-KIN-01). Trả về null nếu không tìm được quan hệ trong dữ liệu (BR-KIN-06).
 * Để có chiều ngược lại, gọi `kinship(index, b, a)`.
 */
export function kinship(
  index: FamilyIndex,
  a: string,
  b: string,
  options: KinshipOptions = {},
): KinshipResult | null {
  if (!index.has(a) || !index.has(b)) return null;
  const terms = KINSHIP_TERMS[options.variant ?? "bac"];

  if (a === b) {
    return result("chính mình", "self", null, 0, null, null, [a], false);
  }
  if (index.areSpouses(a, b)) {
    const g = genderOf(index, b);
    const term = g === "male" ? terms.husband : g === "female" ? terms.wife : `${terms.wife}/${terms.husband}`;
    return result(term, "spouse", null, 0, null, null, [a, b], false);
  }

  const direct = bloodRelation(index, a, b);
  if (direct) return bloodTerm(index, terms, direct);

  // B là vợ/chồng của một người cùng huyết thống với A (dâu, rể, thím, mợ…)
  const viaB = closest(index.spousesOf(b).map((bp) => ({ bp, rel: bloodRelation(index, a, bp) })));
  if (viaB) {
    const t = bloodTerm(index, terms, viaB.rel);
    const term = spouseTerm(terms, t.term, genderOf(index, viaB.bp), genderOf(index, b));
    return { ...t, term, kind: "in-law", path: [...t.path, b], viaMarriage: true };
  }

  // A là vợ/chồng của người cùng huyết thống với B: A gọi theo chồng/vợ
  const viaA = closest(index.spousesOf(a).map((ap) => ({ ap, rel: bloodRelation(index, ap, b) })));
  if (viaA) {
    const t = bloodTerm(index, terms, viaA.rel);
    let term = t.term;
    if (t.kind === "ancestor" && t.generationGap === 1) {
      term = `${t.term} ${genderOf(index, viaA.ap) === "female" ? terms.wife : terms.husband}`;
    }
    return { ...t, term, kind: "in-law", path: [a, ...t.path], viaMarriage: true };
  }

  // Cả hai đều là dâu/rể (vd. hai chị em dâu)
  let best: { ap: string; bp: string; rel: BloodRelation } | null = null;
  for (const ap of index.spousesOf(a)) {
    for (const bp of index.spousesOf(b)) {
      const rel = bloodRelation(index, ap, bp);
      if (rel && (!best || size(rel) < size(best.rel))) best = { ap, bp, rel };
    }
  }
  if (best) {
    const t = bloodTerm(index, terms, best.rel);
    const term = spouseTerm(terms, t.term, genderOf(index, best.bp), genderOf(index, b));
    return { ...t, term, kind: "in-law", path: [a, ...t.path, b], viaMarriage: true };
  }
  return null;
}

/** Tổ tiên của `id` (kể cả chính nó) kèm đường đi ngắn nhất, theo thứ tự duyệt rộng. */
function ancestorPaths(index: FamilyIndex, id: string): Map<string, string[]> {
  const paths = new Map<string, string[]>([[id, [id]]]);
  const queue = [id];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    const path = paths.get(current)!;
    for (const parent of index.parentsOf(current)) {
      if (!paths.has(parent)) {
        paths.set(parent, [...path, parent]);
        queue.push(parent);
      }
    }
  }
  return paths;
}

/** Tổ tiên chung gần nhất (BR-KIN-01): tổng số đời từ hai phía nhỏ nhất. */
export function bloodRelation(index: FamilyIndex, a: string, b: string): BloodRelation | null {
  const ancA = ancestorPaths(index, a);
  const ancB = ancestorPaths(index, b);
  let best: BloodRelation | null = null;
  for (const [anc, pathA] of ancA) {
    const pathB = ancB.get(anc);
    if (!pathB) continue;
    if (!best || pathA.length + pathB.length < best.pathA.length + best.pathB.length) {
      best = { lca: anc, pathA, pathB };
    }
  }
  return best;
}

/**
 * Nhánh của `cB` có trên nhánh của `cA` không, tại cha/mẹ chung `parent` (BR-KIN-02):
 * so thứ tự hôn phối rồi thứ tự con, không so tuổi thật; thiếu dữ liệu mới dùng năm sinh.
 */
function isSeniorBranch(index: FamilyIndex, cA: string, cB: string, parent: string): boolean | null {
  const ea = index.edgeUnder(cA, parent);
  const eb = index.edgeUnder(cB, parent);
  if (ea && eb) {
    const ua = index.union(ea.unionId)?.orderIndex ?? 0;
    const ub = index.union(eb.unionId)?.orderIndex ?? 0;
    if (ua !== ub) return ub < ua;
    if (ea.birthOrder !== eb.birthOrder) return eb.birthOrder < ea.birthOrder;
  }
  const ya = index.person(cA)?.birthYear;
  const yb = index.person(cB)?.birthYear;
  if (ya && yb && ya !== yb) return yb < ya;
  return null;
}

function bloodTerm(index: FamilyIndex, terms: KinshipTerms, rel: BloodRelation): KinshipResult {
  const { lca, pathA, pathB } = rel;
  const a = pathA[0]!;
  const b = pathB[0]!;
  const dA = pathA.length - 1;
  const dB = pathB.length - 1;
  const gB = genderOf(index, b);
  const path = [...pathA, ...pathB.slice(0, -1).reverse()];
  const sideA = dA >= 1 ? sideOf(index, pathA[1]!) : null;

  // B là tổ tiên trực hệ của A
  if (dB === 0) {
    let term: string;
    if (dA === 1) term = pick(gB, terms.father, terms.mother);
    else if (dA === 2) term = withSide(pick(gB, terms.grandfather, terms.grandmother), sideA);
    else if (dA === 3) term = withSide(terms.greatGrandparent, sideA);
    else if (dA === 4) term = withSide(terms.greatGreatGrandparent, sideA);
    else term = `tổ đời thứ ${dA}`;
    return result(term, "ancestor", sideA, dA, null, lca, path, false);
  }

  // B là hậu duệ trực hệ của A
  if (dA === 0) {
    const sideB = dB >= 2 ? sideOf(index, pathB[dB - 1]!) : null;
    const base = dB <= 5 ? terms.descendants[dB - 1]! : `hậu duệ đời thứ ${dB}`;
    return result(withSide(base, sideB), "descendant", sideB, -dB, null, lca, path, false);
  }

  const senior = isSeniorBranch(index, pathA[dA - 1]!, pathB[dB - 1]!, lca);

  // Cùng đời: anh chị em ruột hoặc họ
  if (dA === dB) {
    let term: string;
    if (senior === true) term = pick(gB, terms.olderBrother, terms.olderSister);
    else if (senior === false) term = terms.younger;
    else term = `${pick(gB, terms.olderBrother, terms.olderSister)}/${terms.younger}`;
    if (dA >= 2) term += " họ";
    return result(term, dA === 1 ? "sibling" : "cousin", sideA, 0, senior, lca, path, false);
  }

  // B ở đời trên, nhánh bên (bác, chú, cô, cậu, dì, ông chú, bà cô…)
  if (dA > dB) {
    const gap = dA - dB;
    const peer = pathA[gap]!; // tổ tiên của A ngang đời với B
    const table = genderOf(index, peer) === "female" ? terms.maternal : terms.paternal;
    const male = senior === false ? table.youngerMale : senior === true ? table.elderMale : joinDistinct(table.elderMale, table.youngerMale);
    const female = senior === false ? table.youngerFemale : senior === true ? table.elderFemale : joinDistinct(table.elderFemale, table.youngerFemale);
    const uncle = gB === "male" ? male : gB === "female" ? female : joinDistinct(male, female);
    let term: string;
    if (gap === 1) term = dB >= 2 ? `${uncle} họ` : uncle;
    else if (gap === 2) term = `${pick(gB, terms.grandfather, terms.grandmother)} ${uncle}`;
    else if (gap === 3) term = terms.greatGrandparent;
    else if (gap === 4) term = terms.greatGreatGrandparent;
    else term = `tổ đời thứ ${gap}`;
    return result(term, "elder-collateral", sideA, gap, senior, lca, path, false);
  }

  // B ở đời dưới, nhánh bên (cháu, chắt…)
  const gap = dB - dA;
  let term = gap === 1 ? terms.descendants[1]! : gap <= 5 ? terms.descendants[gap - 1]! : `hậu duệ đời thứ ${gap}`;
  if (dA >= 2) term += " họ";
  return result(term, "younger-collateral", sideA, -gap, senior, lca, path, false);
}

/** Cách gọi vợ/chồng của người A gọi là `term` (BR-KIN-05). */
function spouseTerm(terms: KinshipTerms, term: string, bridgeGender: Gender, bGender: Gender): string {
  const bridgeMale = bridgeGender !== "female";
  if (term.endsWith(" họ")) {
    return `${spouseTerm(terms, term.slice(0, -3), bridgeGender, bGender)} họ`;
  }
  const dauRe = (base: string) => `${base} ${bridgeMale ? "dâu" : "rể"}`;

  if (term === terms.olderBrother) return `${terms.olderSister} dâu`;
  if (term === terms.olderSister) return `${terms.olderBrother} rể`;
  if (term === terms.younger || term.endsWith(`/${terms.younger}`)) return dauRe(terms.younger);

  const words = term.split(" ");
  const head = words[0]!;
  if (terms.descendants.includes(head)) return [dauRe(head), ...words.slice(1)].join(" ");

  const mapped = terms.spouseOf[term];
  if (mapped) {
    const t = bridgeMale ? mapped.ifMale : mapped.ifFemale;
    if (t) return t;
  }
  if (term === terms.father) return `${terms.mother} kế`;
  if (term === terms.mother) return `${terms.father} dượng`;

  if (head === terms.grandfather || head === terms.grandmother) {
    const swapped = head === terms.grandfather ? terms.grandmother : terms.grandfather;
    const rest = words.slice(1).join(" ");
    if (rest === "" || rest === "nội" || rest === "ngoại") return [swapped, ...words.slice(1)].join(" ");
    const restMapped = terms.spouseOf[rest];
    const r = restMapped && (bridgeMale ? restMapped.ifMale : restMapped.ifFemale);
    return `${swapped} ${r ?? rest}`;
  }
  if (term.startsWith(terms.greatGrandparent) || term.startsWith(terms.greatGreatGrandparent) || term.startsWith("tổ")) {
    return term;
  }
  return `${bGender === "female" ? terms.wife : terms.husband} của ${term}`;
}

function result(
  term: string,
  kind: KinshipKind,
  side: "nội" | "ngoại" | null,
  generationGap: number,
  bIsSenior: boolean | null,
  commonAncestorId: string | null,
  path: string[],
  viaMarriage: boolean,
): KinshipResult {
  return { term, kind, side, generationGap, bIsSenior, commonAncestorId, path, viaMarriage };
}

function genderOf(index: FamilyIndex, id: string): Gender {
  return index.person(id)?.gender ?? "unknown";
}

function sideOf(index: FamilyIndex, parentOnPath: string): "nội" | "ngoại" | null {
  const g = genderOf(index, parentOnPath);
  return g === "male" ? "nội" : g === "female" ? "ngoại" : null;
}

function pick(g: Gender, male: string, female: string): string {
  return g === "male" ? male : g === "female" ? female : `${male}/${female}`;
}

function withSide(term: string, side: "nội" | "ngoại" | null): string {
  return side ? `${term} ${side}` : term;
}

function joinDistinct(x: string, y: string): string {
  return x === y ? x : `${x}/${y}`;
}

function size(rel: BloodRelation): number {
  return rel.pathA.length + rel.pathB.length;
}

function closest<T extends { rel: BloodRelation | null }>(items: T[]): (T & { rel: BloodRelation }) | null {
  let best: (T & { rel: BloodRelation }) | null = null;
  for (const item of items) {
    if (item.rel && (!best || size(item.rel) < size(best.rel))) best = item as T & { rel: BloodRelation };
  }
  return best;
}
