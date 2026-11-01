import type { FamilyIndex } from "./graph.js";

/** Dòng họ tính theo cha (phổ biến) hay theo mẹ. */
export type LineageMode = "patrilineal" | "matrilineal";

export interface LineageInfo {
  /** Đời, thuỷ tổ = 1 (BR-TREE-04) */
  generation: number;
  /** Người mang họ của dòng họ (con của người nam trong họ khi tính theo cha) */
  inClan: boolean;
  /** Vợ/chồng từ ngoài họ — mang số đời của người trong họ */
  isSpouse: boolean;
  /** Con riêng gắn vào hôn phối, không cùng huyết thống */
  isStepChild: boolean;
  /**
   * Đường dẫn dạng ltree, ví dụ "1.3.2" = con thứ 2 của con thứ 3 của thuỷ tổ.
   * Chỉ có với hậu duệ huyết thống/con nuôi; dùng để truy vấn cả nhánh bằng một câu SQL.
   */
  path: string | null;
}

export interface LineageOptions {
  mode?: LineageMode;
}

/**
 * Tính đời, thuộc họ, đường dẫn nhánh cho mọi người nối được với thuỷ tổ `rootId`.
 * Người không nối được với thuỷ tổ không có trong kết quả (giao diện báo "chưa gắn vào cây").
 * Duyệt theo chiều rộng nên mỗi người nhận số đời nhỏ nhất có thể.
 */
export function computeLineage(
  index: FamilyIndex,
  rootId: string,
  options: LineageOptions = {},
): Map<string, LineageInfo> {
  const mode = options.mode ?? "patrilineal";
  const result = new Map<string, LineageInfo>();
  if (!index.has(rootId)) return result;

  result.set(rootId, { generation: 1, inClan: true, isSpouse: false, isStepChild: false, path: "1" });
  const queue: string[] = [rootId];
  const lineageGender = mode === "patrilineal" ? "male" : "female";

  for (let head = 0; head < queue.length; head++) {
    const pid = queue[head]!;
    const info = result.get(pid)!;
    const carriesLine =
      info.inClan && (index.person(pid)?.gender ?? "unknown") !== oppositeOf(lineageGender);

    let siblingIndex = 0;
    for (const union of index.unionsOf(pid)) {
      const partner = index.partnerIn(union, pid);
      if (partner !== null && index.has(partner) && !result.has(partner)) {
        result.set(partner, {
          generation: info.generation,
          inClan: false,
          isSpouse: true,
          isStepChild: false,
          path: null,
        });
      }
      for (const edge of index.childEdgesOfUnion(union.id)) {
        const childId = edge.childId;
        if (!index.has(childId)) continue;
        if (edge.relation === "step") {
          if (!result.has(childId)) {
            result.set(childId, {
              generation: info.generation + 1,
              inClan: false,
              isSpouse: false,
              isStepChild: true,
              path: null,
            });
          }
          continue;
        }
        siblingIndex++;
        const existing = result.get(childId);
        if (existing && !existing.isSpouse && !existing.isStepChild) {
          // Đã gặp qua cha/mẹ khác (vd. hôn nhân trong họ): chỉ nâng cờ thuộc họ
          if (carriesLine && !existing.inClan) existing.inClan = true;
          continue;
        }
        result.set(childId, {
          generation: info.generation + 1,
          inClan: carriesLine,
          isSpouse: false,
          isStepChild: false,
          path: info.path === null ? null : `${info.path}.${siblingIndex}`,
        });
        queue.push(childId);
      }
    }
  }
  return result;
}

function oppositeOf(g: "male" | "female"): "male" | "female" {
  return g === "male" ? "female" : "male";
}
