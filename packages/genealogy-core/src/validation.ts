import { FamilyIndex } from "./graph.js";
import type { FamilyGraph } from "./types.js";

export type IssueCode =
  | "DANGLING_REFERENCE"
  | "SELF_UNION"
  | "DUPLICATE_UNION"
  | "SELF_PARENT"
  | "MULTIPLE_BIOLOGICAL_PARENTS"
  | "DUPLICATE_BIRTH_ORDER"
  | "ANCESTOR_CYCLE"
  | "CHILD_BORN_BEFORE_PARENT";

export interface ValidationIssue {
  code: IssueCode;
  /** `error` chặn lưu; `warning` chỉ cảnh báo (dữ liệu cổ có thể sai) */
  severity: "error" | "warning";
  /** Mã quy tắc nghiệp vụ trong tài liệu đặc tả */
  rule: string;
  message: string;
  ids: string[];
}

/** `ancestorId` có phải tổ tiên (theo vai vế: ruột + nuôi) của `personId` không. */
export function isAncestor(index: FamilyIndex, ancestorId: string, personId: string): boolean {
  if (ancestorId === personId) return false;
  const seen = new Set<string>([personId]);
  const queue = [personId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const parent of index.parentsOf(current)) {
      if (parent === ancestorId) return true;
      if (!seen.has(parent)) {
        seen.add(parent);
        queue.push(parent);
      }
    }
  }
  return false;
}

/**
 * Gắn `childId` làm con của các `parentIds` có tạo vòng lặp tổ tiên không (BR-TREE-02).
 * Gọi trước khi lưu một quan hệ cha mẹ – con mới.
 */
export function wouldCreateCycle(index: FamilyIndex, childId: string, parentIds: readonly string[]): boolean {
  return parentIds.some((p) => p === childId || isAncestor(index, childId, p));
}

/** Kiểm tra toàn bộ cây — dùng khi nhập Excel/GEDCOM và trong test dữ liệu. */
export function validateGraph(graph: FamilyGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const index = new FamilyIndex(graph);
  const unionIds = new Set(graph.unions.map((u) => u.id));

  // Tham chiếu hỏng, hôn phối với chính mình, hôn phối trùng
  const pairs = new Map<string, string>();
  for (const u of graph.unions) {
    for (const p of [u.partnerA, u.partnerB]) {
      if (p !== null && !index.has(p)) {
        issues.push(issue("DANGLING_REFERENCE", "error", "DATA", `Hôn phối ${u.id} trỏ tới người không tồn tại ${p}`, [u.id, p]));
      }
    }
    if (u.partnerB !== null && u.partnerA === u.partnerB) {
      issues.push(issue("SELF_UNION", "error", "DATA", `Hôn phối ${u.id} có hai bên là cùng một người`, [u.id]));
    }
    if (u.partnerB !== null) {
      const key = [u.partnerA, u.partnerB].sort().join("|");
      const existing = pairs.get(key);
      if (existing) {
        issues.push(issue("DUPLICATE_UNION", "error", "DATA", `Hôn phối ${u.id} trùng với ${existing}`, [existing, u.id]));
      } else {
        pairs.set(key, u.id);
      }
    }
  }

  const biologicalCount = new Map<string, number>();
  const orderSeen = new Map<string, string>();
  for (const c of graph.children) {
    if (!index.has(c.childId)) {
      issues.push(issue("DANGLING_REFERENCE", "error", "DATA", `Quan hệ con trỏ tới người không tồn tại ${c.childId}`, [c.childId]));
    }
    if (!unionIds.has(c.unionId)) {
      issues.push(issue("DANGLING_REFERENCE", "error", "DATA", `Quan hệ con trỏ tới hôn phối không tồn tại ${c.unionId}`, [c.unionId]));
      continue;
    }
    const u = index.union(c.unionId)!;
    if (u.partnerA === c.childId || u.partnerB === c.childId) {
      issues.push(issue("SELF_PARENT", "error", "BR-TREE-02", `${c.childId} vừa là cha/mẹ vừa là con trong hôn phối ${u.id}`, [c.childId, u.id]));
    }
    if (c.relation === "biological") {
      biologicalCount.set(c.childId, (biologicalCount.get(c.childId) ?? 0) + 1);
    }
    const orderKey = `${c.unionId}#${c.birthOrder}`;
    const other = orderSeen.get(orderKey);
    if (other !== undefined) {
      issues.push(issue("DUPLICATE_BIRTH_ORDER", "error", "BR-TREE-05", `${other} và ${c.childId} cùng thứ tự con ${c.birthOrder} trong hôn phối ${c.unionId}`, [other, c.childId]));
    } else {
      orderSeen.set(orderKey, c.childId);
    }
  }
  for (const [childId, count] of biologicalCount) {
    if (count > 1) {
      issues.push(issue("MULTIPLE_BIOLOGICAL_PARENTS", "error", "BR-TREE-01", `${childId} có ${count} cặp cha mẹ ruột`, [childId]));
    }
  }

  issues.push(...findCycles(index));

  // Cha mẹ sinh sau con: chỉ cảnh báo (BR-TREE-03)
  for (const c of graph.children) {
    const child = index.person(c.childId);
    const u = index.union(c.unionId);
    if (!child?.birthYear || !u) continue;
    for (const pid of [u.partnerA, u.partnerB]) {
      const parent = pid === null ? undefined : index.person(pid);
      if (parent?.birthYear && parent.birthYear >= child.birthYear) {
        issues.push(issue("CHILD_BORN_BEFORE_PARENT", "warning", "BR-TREE-03", `${parent.id} (sinh ${parent.birthYear}) không sinh trước con ${child.id} (sinh ${child.birthYear})`, [parent.id, child.id]));
      }
    }
  }
  return issues;
}

/** Tìm vòng lặp trên đồ thị cha mẹ → con (mọi loại quan hệ con), DFS không đệ quy. */
function findCycles(index: FamilyIndex): ValidationIssue[] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const issues: ValidationIssue[] = [];
  const childrenAll = (id: string) => index.childEdgesOf(id).map((e) => e.childId);

  for (const start of index.graph.persons.map((p) => p.id)) {
    if ((color.get(start) ?? WHITE) !== WHITE) continue;
    const stack: Array<{ id: string; next: number; kids: string[] }> = [
      { id: start, next: 0, kids: childrenAll(start) },
    ];
    color.set(start, GRAY);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      if (frame.next >= frame.kids.length) {
        color.set(frame.id, BLACK);
        stack.pop();
        continue;
      }
      const kid = frame.kids[frame.next++]!;
      const c = color.get(kid) ?? WHITE;
      if (c === GRAY) {
        const from = stack.findIndex((f) => f.id === kid);
        const cycle = stack.slice(from).map((f) => f.id);
        issues.push(issue("ANCESTOR_CYCLE", "error", "BR-TREE-02", `Vòng lặp tổ tiên: ${[...cycle, kid].join(" → ")}`, cycle));
      } else if (c === WHITE) {
        color.set(kid, GRAY);
        stack.push({ id: kid, next: 0, kids: childrenAll(kid) });
      }
    }
  }
  return issues;
}

function issue(
  code: IssueCode,
  severity: "error" | "warning",
  rule: string,
  message: string,
  ids: string[],
): ValidationIssue {
  return { code, severity, rule, message, ids };
}
