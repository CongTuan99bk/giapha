import type { TreeNode } from "./types";

/** Phép biến đổi khung nhìn: toạ độ màn hình = toạ độ cây * k + (x, y). */
export interface View {
  x: number;
  y: number;
  k: number;
}

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 2.5;
export const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

// dùng chung với bản xuất PDF/SVG phía máy chủ
export { wrapName } from "@coinguon/genealogy-core";

/** Khung nhìn vừa cả cây trong vùng w×h (có lề), không phóng to quá 100%. */
export function fitView(treeW: number, treeH: number, w: number, h: number, pad = 48): View {
  if (treeW <= 0 || treeH <= 0) return { x: pad, y: pad, k: 1 };
  const k = clampZoom(Math.min((w - pad * 2) / treeW, (h - pad * 2) / treeH, 1));
  return { k, x: (w - treeW * k) / 2, y: Math.max(pad, (h - treeH * k) / 2) };
}

/** Khung nhìn đặt một nút ở giữa (theo chiều ngang) và gần đầu màn hình. */
export function focusView(node: Pick<TreeNode, "x" | "y" | "width" | "height">, w: number, h: number, k = 1): View {
  return { k, x: w / 2 - (node.x + node.width / 2) * k, y: Math.min(h / 3, 120) - node.y * k };
}

/** Phóng to/thu nhỏ quanh điểm (px, py) trên màn hình, giữ điểm đó đứng yên. */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const k = clampZoom(v.k * factor);
  const r = k / v.k;
  return { k, x: px - (px - v.x) * r, y: py - (py - v.y) * r };
}

/** Các nút nằm trong màn hình (cộng lề) — chỉ vẽ những nút này khi cây lớn. */
export function visibleNodes(nodes: TreeNode[], v: View, w: number, h: number, margin = 200): TreeNode[] {
  const x0 = (-v.x - margin) / v.k;
  const y0 = (-v.y - margin) / v.k;
  const x1 = (w - v.x + margin) / v.k;
  const y1 = (h - v.y + margin) / v.k;
  return nodes.filter((n) => n.x + n.width >= x0 && n.x <= x1 && n.y + n.height >= y0 && n.y <= y1);
}

/** Toạ độ y (theo cây) của từng hàng đời: depth → {top, bottom}. */
export function generationRows(nodes: TreeNode[]): Map<number, { top: number; bottom: number }> {
  const rows = new Map<number, { top: number; bottom: number }>();
  for (const n of nodes) {
    const r = rows.get(n.depth);
    if (!r) rows.set(n.depth, { top: n.y, bottom: n.y + n.height });
    else {
      r.top = Math.min(r.top, n.y);
      r.bottom = Math.max(r.bottom, n.y + n.height);
    }
  }
  return rows;
}
