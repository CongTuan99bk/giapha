import type { FamilyIndex } from "./graph.js";
import type { ChildRelation } from "./types.js";

export interface LayoutOptions {
  /** Người làm gốc hiển thị (thường là thuỷ tổ, hoặc người được chọn "xem từ đây") */
  rootId: string;
  orientation?: "vertical" | "horizontal";
  nodeWidth?: number;
  nodeHeight?: number;
  /** Khoảng cách giữa người và vợ/chồng trong cùng khối gia đình */
  spouseGap?: number;
  /** Khoảng cách giữa hai khối anh em */
  siblingGap?: number;
  /** Khoảng cách giữa hai đời */
  levelGap?: number;
  /** Người bị thu gọn nhánh: không vẽ hậu duệ */
  collapsed?: ReadonlySet<string>;
  /** Số đời tối đa vẽ, tính cả gốc (FR-TREE-06) */
  maxDepth?: number;
  /** Có vẽ con của người không mang dòng họ (vd. con của con gái khi tính theo cha) — mặc định có */
  expand?: (personId: string) => boolean;
}

export interface LayoutNode {
  personId: string;
  /** Toạ độ góc trên trái */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0 = gốc hiển thị */
  depth: number;
  /** Vợ/chồng đứng cạnh người trong dòng hiển thị */
  isSpouse: boolean;
  /** Có hậu duệ bị ẩn (thu gọn hoặc vượt maxDepth) — hiện nút ⊕ */
  hasHiddenChildren: boolean;
}

export interface LayoutEdge {
  unionId: string;
  childId: string;
  relation: ChildRelation;
  /** Đường gấp khúc từ cặp cha mẹ xuống con */
  points: Array<[number, number]>;
}

export interface TreeLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

interface Block {
  personId: string;
  spouses: Array<{ id: string | null; unionId: string }>;
  children: Array<{ unionId: string; relation: ChildRelation; block: Block }>;
  /** Có con không được vẽ */
  hidden: boolean;
  unitWidth: number;
  subtreeWidth: number;
  depth: number;
}

/**
 * Bố cục phả đồ dạng cây hậu duệ: mỗi khối = một người + các vợ/chồng xếp cạnh nhau,
 * con treo dưới đúng cặp hôn phối. Cha mẹ căn giữa trên các con, các nhánh không chồng lên nhau.
 * Độ phức tạp O(n). Một người xuất hiện hai lần (hôn nhân trong họ) chỉ được vẽ một lần.
 *
 * Hàm thuần — chạy được trong Web Worker; giao diện chỉ việc vẽ `nodes` và `edges`.
 */
export function layoutTree(index: FamilyIndex, options: LayoutOptions): TreeLayout {
  const vertical = (options.orientation ?? "vertical") === "vertical";
  const nodeW = options.nodeWidth ?? 160;
  const nodeH = options.nodeHeight ?? 72;
  // "breadth" = chiều trải anh em, "depth" = chiều các đời
  const breadth = vertical ? nodeW : nodeH;
  const depthSize = vertical ? nodeH : nodeW;
  const spouseGap = options.spouseGap ?? 12;
  const siblingGap = options.siblingGap ?? 24;
  const levelGap = options.levelGap ?? 72;
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const collapsed = options.collapsed ?? new Set<string>();
  const expand = options.expand ?? (() => true);

  if (!index.has(options.rootId)) return { nodes: [], edges: [], width: 0, height: 0 };

  const placed = new Set<string>();
  const build = (personId: string, depth: number): Block => {
    placed.add(personId);
    const spouses: Block["spouses"] = [];
    for (const u of index.unionsOf(personId)) {
      const partner = index.partnerIn(u, personId);
      const usable = partner !== null && index.has(partner) && !placed.has(partner) ? partner : null;
      if (usable) placed.add(usable);
      spouses.push({ id: usable, unionId: u.id });
    }
    const block: Block = {
      personId,
      spouses,
      children: [],
      hidden: false,
      unitWidth: 0,
      subtreeWidth: 0,
      depth,
    };
    const visibleSpouses = spouses.filter((s) => s.id !== null).length;
    block.unitWidth = (1 + visibleSpouses) * breadth + visibleSpouses * spouseGap;

    const canExpand = !collapsed.has(personId) && depth + 1 < maxDepth && expand(personId);
    for (const s of spouses) {
      for (const edge of index.childEdgesOfUnion(s.unionId)) {
        if (!index.has(edge.childId) || placed.has(edge.childId)) continue;
        if (!canExpand) {
          block.hidden = true;
          continue;
        }
        block.children.push({ unionId: s.unionId, relation: edge.relation, block: build(edge.childId, depth + 1) });
      }
    }
    const childrenWidth = block.children.reduce(
      (sum, c, i) => sum + c.block.subtreeWidth + (i > 0 ? siblingGap : 0),
      0,
    );
    block.subtreeWidth = Math.max(block.unitWidth, childrenWidth);
    return block;
  };

  const root = build(options.rootId, 0);
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  let maxD = 0;

  const toXY = (b: number, d: number): [number, number] => (vertical ? [b, d] : [d, b]);
  const box = { w: vertical ? nodeW : nodeW, h: vertical ? nodeH : nodeH };

  const place = (block: Block, left: number): void => {
    const d = block.depth * (depthSize + levelGap);
    maxD = Math.max(maxD, d + depthSize);
    const unitLeft = left + (block.subtreeWidth - block.unitWidth) / 2;
    // vị trí theo chiều "breadth" của từng người trong khối
    const slot = new Map<string, number>();
    let cursor = unitLeft;
    const addNode = (id: string, isSpouse: boolean) => {
      const [x, y] = toXY(cursor, d);
      nodes.push({
        personId: id,
        x,
        y,
        width: box.w,
        height: box.h,
        depth: block.depth,
        isSpouse,
        hasHiddenChildren: !isSpouse && block.hidden,
      });
      slot.set(id, cursor);
      cursor += breadth + spouseGap;
    };
    addNode(block.personId, false);
    for (const s of block.spouses) if (s.id !== null) addNode(s.id, true);

    const childrenWidth = block.children.reduce(
      (sum, c, i) => sum + c.block.subtreeWidth + (i > 0 ? siblingGap : 0),
      0,
    );
    let childLeft = left + (block.subtreeWidth - childrenWidth) / 2;
    const selfCenter = slot.get(block.personId)! + breadth / 2;
    for (const child of block.children) {
      const spouse = block.spouses.find((s) => s.unionId === child.unionId);
      const spouseCenter = spouse?.id ? slot.get(spouse.id)! + breadth / 2 : null;
      const from = spouseCenter === null ? selfCenter : (selfCenter + spouseCenter) / 2;
      place(child.block, childLeft);
      const childUnitLeft = childLeft + (child.block.subtreeWidth - child.block.unitWidth) / 2;
      const to = childUnitLeft + breadth / 2;
      const parentBottom = d + depthSize;
      const childTop = (block.depth + 1) * (depthSize + levelGap);
      const mid = parentBottom + levelGap / 2;
      edges.push({
        unionId: child.unionId,
        childId: child.block.personId,
        relation: child.relation,
        points: [toXY(from, parentBottom), toXY(from, mid), toXY(to, mid), toXY(to, childTop)],
      });
      childLeft += child.block.subtreeWidth + siblingGap;
    }
  };

  place(root, 0);
  const [width, height] = vertical ? [root.subtreeWidth, maxD] : [maxD, root.subtreeWidth];
  return { nodes, edges, width, height };
}
