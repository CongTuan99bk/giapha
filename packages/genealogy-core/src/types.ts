export type Gender = "male" | "female" | "unknown";

/**
 * Quan hệ con – cặp cha mẹ:
 * - `biological`: con ruột của cả hai người trong hôn phối
 * - `adopted`: con nuôi (tính như con ruột khi xét vai vế, xưng hô)
 * - `step`: con riêng — hiển thị dưới hôn phối nhưng không tính huyết thống với cả cặp
 */
export type ChildRelation = "biological" | "adopted" | "step";

/** Dữ liệu tối thiểu của một người mà logic phả hệ cần (không phải toàn bộ hồ sơ). */
export interface PersonNode {
  id: string;
  gender: Gender;
  birthYear?: number | null;
}

/** Hôn phối. `partnerB` rỗng = không rõ vợ/chồng nhưng vẫn cần treo con. */
export interface UnionEdge {
  id: string;
  partnerA: string;
  partnerB: string | null;
  /** Thứ tự hôn phối của partnerA: vợ cả = 1, vợ hai = 2… */
  orderIndex: number;
}

export interface ChildEdge {
  unionId: string;
  childId: string;
  relation: ChildRelation;
  /** Thứ tự con trong cặp: con trưởng = 1 (BR-TREE-05) */
  birthOrder: number;
}

export interface FamilyGraph {
  persons: PersonNode[];
  unions: UnionEdge[];
  children: ChildEdge[];
}
