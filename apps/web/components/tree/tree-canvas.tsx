"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { lifespan } from "@/lib/format";
import { mediaUrl } from "@/lib/upload";
import { fitView, focusView, generationRows, visibleNodes, wrapName, zoomAt, type View } from "@/lib/tree-view";
import type { TreeLayout, TreeNode } from "@/lib/types";

interface Props {
  layout: TreeLayout;
  /** Dùng để dựng đường dẫn ảnh chân dung */
  clanId: string;
  selectedId: string | null;
  onSelect: (personId: string) => void;
  /** Yêu cầu đưa một người vào giữa màn hình (đổi `nonce` để yêu cầu lại) */
  focus?: { personId: string; nonce: number } | null;
}

const CULL_THRESHOLD = 300; // cây lớn hơn thì chỉ vẽ phần đang nhìn thấy
const DRAG_SLOP = 5;

/**
 * Phả đồ vẽ bằng SVG từ bố cục API đã tính sẵn.
 * Kéo để di chuyển, cuộn/chụm hai ngón để phóng to, bấm vào người để chọn.
 * Dải bên trái ghi "Đời n" như lề cuốn gia phả, luôn khớp với hàng đang xem.
 */
export function TreeCanvas({ layout, clanId, selectedId, onSelect, focus }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean; pinch?: { dist: number; view: View } } | null>(null);
  const suppressClick = useRef(false);

  const rootNode = useMemo(() => layout.nodes.find((n) => n.personId === layout.rootId) ?? layout.nodes[0], [layout]);
  const rootGeneration = rootNode?.person.generation ?? 1;
  const rows = useMemo(() => generationRows(layout.nodes), [layout.nodes]);
  const nodeById = useMemo(() => new Map(layout.nodes.map((n) => [n.personId, n])), [layout.nodes]);

  // Theo dõi kích thước khung
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Khung nhìn ban đầu: vừa cả cây nếu không quá nhỏ, nếu không thì đưa thuỷ tổ vào giữa
  useEffect(() => {
    if (view || size.w === 0 || !rootNode) return;
    const fit = fitView(layout.width, layout.height, size.w - RAIL, size.h);
    setView(fit.k >= 0.55 ? { ...fit, x: fit.x + RAIL } : focusView(rootNode, size.w + RAIL, size.h, 0.85));
  }, [size, layout, rootNode, view]);

  useEffect(() => {
    if (!focus || size.w === 0) return;
    const n = nodeById.get(focus.personId);
    if (n) setView((v) => ({ ...focusView(n, size.w + RAIL, size.h, Math.max(v?.k ?? 1, 0.85)) }));
  }, [focus, nodeById, size]);

  // Cuộn chuột để phóng to (cần listener không passive để chặn cuộn trang)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setView((v) => (v ? zoomAt(v, factor, e.clientX - rect.left, e.clientY - rect.top) : v));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!view || e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      drag.current = { x: 0, y: 0, view, moved: true, pinch: { dist: Math.hypot(a.x - b.x, a.y - b.y), view } };
    } else {
      drag.current = { x: e.clientX, y: e.clientY, view, moved: false };
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (d.pinch && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const rect = box.current!.getBoundingClientRect();
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      setView(zoomAt(d.pinch.view, dist / d.pinch.dist, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top));
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    if (!d.moved) {
      d.moved = true;
      box.current?.setPointerCapture(e.pointerId);
    }
    setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy });
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (drag.current?.moved) suppressClick.current = true;
    if (pointers.current.size === 0) drag.current = null;
  };

  const select = useCallback(
    (id: string) => {
      if (suppressClick.current) {
        suppressClick.current = false;
        return;
      }
      onSelect(id);
    },
    [onSelect],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!view || e.target !== e.currentTarget) return;
    const step = 80;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const mv = moves[e.key];
    if (mv) {
      e.preventDefault();
      setView({ ...view, x: view.x + mv[0], y: view.y + mv[1] });
    } else if (e.key === "+" || e.key === "=") setView(zoomAt(view, 1.2, size.w / 2, size.h / 2));
    else if (e.key === "-") setView(zoomAt(view, 1 / 1.2, size.w / 2, size.h / 2));
  };

  const zoomBy = (f: number) => view && setView(zoomAt(view, f, size.w / 2, size.h / 2));
  const fitAll = () => {
    const fit = fitView(layout.width, layout.height, size.w - RAIL, size.h);
    setView({ ...fit, x: fit.x + RAIL });
  };

  const shown = useMemo(
    () => (view && layout.nodes.length > CULL_THRESHOLD ? visibleNodes(layout.nodes, view, size.w, size.h) : layout.nodes),
    [layout.nodes, view, size],
  );
  const shownIds = useMemo(() => (shown === layout.nodes ? null : new Set(shown.map((n) => n.personId))), [shown, layout.nodes]);
  const couples = useMemo(() => coupleLinks(layout.nodes), [layout.nodes]);

  return (
    <div
      ref={box}
      className="absolute inset-0 cursor-grab touch-none select-none overflow-hidden bg-ngoc-50 outline-none active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="application"
      aria-label="Phả đồ. Dùng phím mũi tên để di chuyển, phím cộng trừ để phóng to thu nhỏ, phím Tab để đi qua từng người."
    >
      {view && (
        <svg className="absolute inset-0 h-full w-full" aria-hidden={false}>
          <defs>
            {/* khung ảnh chân dung bo góc, dùng chung cho mọi ô */}
            <clipPath id="khung-chan-dung" clipPathUnits="objectBoundingBox">
              <rect width="1" height="1" rx="0.1" ry="0.08" />
            </clipPath>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {/* Dải màu xen kẽ theo đời */}
            {[...rows.entries()].map(([depth, r]) =>
              depth % 2 === 1 ? (
                <rect
                  key={depth}
                  x={-view.x / view.k - 10}
                  width={size.w / view.k + 20}
                  y={r.top - 24}
                  height={r.bottom - r.top + 48}
                  className="fill-ngoc-100"
                />
              ) : null,
            )}
            <g className="fill-none stroke-then/35" strokeWidth={1.5}>
              {couples.map((c) => (
                <line key={c.key} x1={c.x1} x2={c.x2} y1={c.y} y2={c.y} />
              ))}
              {layout.edges.map((e) =>
                shownIds && !shownIds.has(e.childId) ? null : (
                  <path
                    key={`${e.unionId}-${e.childId}`}
                    d={edgePath(e.points, rootNode?.height ?? 72)}
                    strokeDasharray={e.relation === "adopted" ? "6 4" : e.relation === "step" ? "2 4" : undefined}
                  />
                ),
              )}
            </g>
            {shown.map((n) => (
              <PersonNode
                key={n.personId}
                node={n}
                generation={rootGeneration + n.depth}
                selected={n.personId === selectedId}
                isRoot={n.personId === layout.rootId}
                avatarUrl={n.person.avatarMediaId ? mediaUrl(clanId, n.person.avatarMediaId, "sm") : null}
                onSelect={select}
              />
            ))}
          </g>
        </svg>
      )}

      {/* Lề "Đời n" */}
      {view && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-14 border-r border-ngoc-200 bg-ngoc-50" aria-hidden>
          {[...rows.entries()].map(([depth, r]) => {
            const y = ((r.top + r.bottom) / 2) * view.k + view.y;
            if (y < -40 || y > size.h + 40) return null;
            return (
              <div key={depth} className="absolute left-0 w-14 -translate-y-1/2 text-center leading-none" style={{ top: y }}>
                <span className="block text-[0.7rem] text-reu">Đời</span>
                <span className="block font-serif text-2xl text-then">{rootGeneration + depth}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="absolute bottom-4 left-18 flex gap-1 rounded-lg border border-ngoc-200 bg-giay/95 p-1 shadow-sm" onPointerDown={(e) => e.stopPropagation()}>
        <IconButton label="Phóng to" onClick={() => zoomBy(1.25)}>
          +
        </IconButton>
        <IconButton label="Thu nhỏ" onClick={() => zoomBy(1 / 1.25)}>
          −
        </IconButton>
        <button type="button" className="rounded px-3 text-sm text-then hover:bg-ngoc-100" onClick={fitAll}>
          Xem cả cây
        </button>
      </div>
    </div>
  );
}

const RAIL = 56; // độ rộng lề "Đời n"

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="h-10 w-10 rounded text-xl leading-none text-then hover:bg-ngoc-100">
      {children}
    </button>
  );
}

/** Đường cha mẹ → con, kéo dài lên giữa ô cha mẹ để nối với vạch vợ chồng. */
function edgePath(points: Array<[number, number]>, nodeHeight: number): string {
  const [first, ...rest] = points;
  if (!first) return "";
  const start: [number, number] = [first[0], first[1] - nodeHeight / 2];
  return [start, first, ...rest].map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
}

/** Vạch nối vợ chồng: mỗi người vợ/chồng nối với ô đứng ngay bên trái trong cùng khối. */
function coupleLinks(nodes: TreeNode[]) {
  const links: Array<{ key: string; x1: number; x2: number; y: number }> = [];
  for (let i = 1; i < nodes.length; i++) {
    const n = nodes[i]!;
    const prev = nodes[i - 1]!;
    if (n.isSpouse && prev.depth === n.depth) {
      links.push({ key: `${prev.personId}-${n.personId}`, x1: prev.x + prev.width, x2: n.x, y: n.y + n.height / 2 });
    }
  }
  return links;
}

const PersonNode = memo(function PersonNode({
  node,
  generation,
  selected,
  isRoot,
  avatarUrl,
  onSelect,
}: {
  node: TreeNode;
  generation: number;
  selected: boolean;
  isRoot: boolean;
  avatarUrl: string | null;
  onSelect: (id: string) => void;
}) {
  const p = node.person;
  // Có ảnh: ảnh chân dung bên trái, chữ dịch sang phải và ngắn lại
  const tx = avatarUrl ? 64 : 14;
  const lines = wrapName(p.fullName, avatarUrl ? 13 : 18);
  const span = lifespan(p);
  const outside = !p.inClan;
  const bar = p.gender === "male" ? "fill-son" : p.gender === "female" ? "fill-reu" : "fill-ngoc-300";
  const label = `${p.fullName}, đời ${generation}${span ? `, ${span}` : ""}${isRoot ? ", thuỷ tổ" : ""}${outside ? ", dâu hoặc rể" : ""}`;
  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      data-person-id={node.personId}
      className="cursor-pointer outline-none [&:focus-visible>rect:first-child]:stroke-thep [&:focus-visible>rect:first-child]:stroke-[3]"
      onClick={() => onSelect(node.personId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(node.personId);
        }
      }}
    >
      <rect
        width={node.width}
        height={node.height}
        rx={3}
        className={selected ? "fill-thep-nhat stroke-thep" : outside ? "fill-ngoc-50 stroke-ngoc-300" : "fill-giay stroke-ngoc-300"}
        strokeWidth={selected ? 2.5 : 1}
        strokeDasharray={outside && !selected ? "4 3" : undefined}
      />
      <rect width={4} height={node.height} className={bar} opacity={outside ? 0.5 : 1} />
      {isRoot && <rect width={node.width} height={4} className="fill-thep" />}
      {avatarUrl && (
        <image
          href={avatarUrl}
          x={10}
          y={8}
          width={46}
          height={node.height - 16}
          preserveAspectRatio="xMidYMid slice"
          clipPath="url(#khung-chan-dung)"
        />
      )}
      <text x={tx} y={lines.length === 1 ? 32 : 24} className={`fill-then font-serif ${outside ? "" : "font-medium"}`} fontSize={15.5}>
        {lines.map((l, i) => (
          <tspan key={i} x={tx} dy={i === 0 ? 0 : 18}>
            {l}
          </tspan>
        ))}
      </text>
      {span && (
        <text x={tx} y={node.height - 11} className="fill-reu font-sans tabular-nums" fontSize={12}>
          {span}
        </text>
      )}
      {node.hasHiddenChildren && <circle cx={node.width / 2} cy={node.height + 8} r={5} className="fill-reu" />}
    </g>
  );
});
