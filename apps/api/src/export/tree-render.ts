import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lifespan, wrapName } from "@coinguon/genealogy-core";
import * as fontkit from "fontkit";
import PDFDocument from "pdfkit";
import type { BuiltTree } from "../tree/tree-builder.service.js";

/**
 * Vẽ phả đồ ra PDF / SVG phía máy chủ, giống phả đồ trên web (cùng bố cục, cùng kiểu thẻ người),
 * nhưng nền trắng, lề "Đời n" sáng màu cho đỡ tốn mực khi in.
 *
 * Cách làm: dựng một "cảnh" gồm các hình đơn giản (ô, đường, chữ, ảnh) theo toạ độ điểm ảnh,
 * rồi hai bộ vẽ (PDF, SVG) cùng vẽ cảnh đó.
 */

// ───────────── Phông chữ (nhúng vào file, có đủ dấu tiếng Việt) ─────────────

const FONT_DIR = fileURLToPath(new URL("../../assets/fonts/", import.meta.url));
export const FONT_FILES = {
  serif: "Alegreya-Regular.ttf",
  serifMedium: "Alegreya-Medium.ttf",
  sans: "BeVietnamPro-Regular.ttf",
  sansBold: "BeVietnamPro-SemiBold.ttf",
} as const;
type FontName = keyof typeof FONT_FILES;

const fontBytes = new Map<FontName, Buffer>();
const fontObjs = new Map<FontName, fontkit.Font>();
function fontData(name: FontName): Buffer {
  let b = fontBytes.get(name);
  if (!b) fontBytes.set(name, (b = readFileSync(FONT_DIR + FONT_FILES[name])));
  return b;
}
function font(name: FontName): fontkit.Font {
  let f = fontObjs.get(name);
  if (!f) fontObjs.set(name, (f = fontkit.create(fontData(name)) as fontkit.Font));
  return f;
}
/** Độ rộng chữ (điểm ảnh) theo đúng phông */
export function textWidth(text: string, name: FontName, size: number): number {
  const f = font(name);
  return (f.layout(text).advanceWidth / f.unitsPerEm) * size;
}

// ───────────── Cảnh ─────────────

const C = {
  ink: "#241a17",
  son: "#8e2b21",
  reu: "#4d5f55",
  ngoc300: "#b5c5b2",
  thep: "#a8792a",
  thepDam: "#7a571b",
  card: "#fffdf7",
  cardOutside: "#f4eee1",
  border: "#d6c9ae",
  borderOutside: "#b9a888",
  line: "#8a7563",
  hair: "#e4dccb",
  paper: "#ffffff",
} as const;

type Pt = [number, number];
export type Item =
  | { kind: "rect"; x: number; y: number; w: number; h: number; r?: number; fill?: string; stroke?: string; strokeWidth?: number; dash?: [number, number] }
  | { kind: "line"; points: Pt[]; stroke: string; width: number; dash?: [number, number] }
  | { kind: "text"; x: number; y: number; text: string; font: FontName; size: number; fill: string; anchor?: "start" | "middle" | "end"; sticky?: boolean }
  | { kind: "image"; x: number; y: number; w: number; h: number; r: number; jpeg: Buffer };

export interface Scene {
  width: number;
  height: number;
  items: Item[];
  title: string;
}

export interface SceneInput {
  tree: BuiltTree;
  clanName: string;
  /** Đời của người làm gốc (thuỷ tổ = 1) */
  rootGeneration: number;
  /** Ảnh chân dung đã đổi sang JPEG nhỏ, theo mã ảnh */
  avatars: Map<string, Buffer>;
  /** "9/11/2026" */
  dateText: string;
  subtitle?: string;
}

const RAIL = 64;
/** Lề trái "Đời n" (gồm khoảng đệm) — lặp lại trên mọi trang khi chia nhiều trang */
export const RAIL_BAND = 28 + RAIL;
const HEADER = 92;
const FOOTER = 56;
const PAD = 28;

export function buildScene(input: SceneInput): Scene {
  const { tree, clanName, rootGeneration, avatars } = input;
  const items: Item[] = [];
  const ox = RAIL + PAD;
  const oy = HEADER;
  const width = Math.max(ox + tree.width + PAD, 640);
  const height = oy + tree.height + FOOTER;
  const peopleCount = tree.nodes.length;
  const depths = new Set(tree.nodes.map((n) => n.depth));

  // Tiêu đề
  items.push({ kind: "text", x: PAD, y: 44, text: clanName, font: "serif", size: 32, fill: C.son });
  items.push({
    kind: "text",
    x: PAD,
    y: 70,
    text: input.subtitle ?? `Phả đồ · ${depths.size} đời · ${peopleCount.toLocaleString("vi-VN")} người · in ngày ${input.dateText}`,
    font: "sans",
    size: 13,
    fill: C.reu,
  });
  items.push({ kind: "line", points: [[PAD, 82], [width - PAD, 82]], stroke: C.thep, width: 1.2 });

  // Các hàng đời: vạch mảnh ngăn đời, số đời ở lề trái
  const rows = new Map<number, { top: number; bottom: number }>();
  for (const n of tree.nodes) {
    const r = rows.get(n.depth);
    if (!r) rows.set(n.depth, { top: n.y, bottom: n.y + n.height });
    else {
      r.top = Math.min(r.top, n.y);
      r.bottom = Math.max(r.bottom, n.y + n.height);
    }
  }
  const sorted = [...rows.entries()].sort((a, b) => a[0] - b[0]);
  for (const [i, [depth, r]] of sorted.entries()) {
    const next = sorted[i + 1];
    if (next) {
      const y = oy + (r.bottom + next[1].top) / 2;
      items.push({ kind: "line", points: [[PAD, y], [width - PAD, y]], stroke: C.hair, width: 0.8 });
    }
    const cy = oy + (r.top + r.bottom) / 2;
    items.push({ kind: "text", x: PAD + RAIL / 2 - 6, y: cy - 6, text: "Đời", font: "sans", size: 11, fill: C.thepDam, anchor: "middle", sticky: true });
    items.push({ kind: "text", x: PAD + RAIL / 2 - 6, y: cy + 18, text: String(rootGeneration + depth), font: "serif", size: 24, fill: C.thepDam, anchor: "middle", sticky: true });
  }
  items.push({ kind: "line", points: [[PAD + RAIL - 4, HEADER - 4], [PAD + RAIL - 4, height - FOOTER + 8]], stroke: C.thep, width: 1 });

  // Vạch vợ chồng: mỗi người vợ/chồng nối với ô ngay bên trái trong cùng khối
  for (let i = 1; i < tree.nodes.length; i++) {
    const n = tree.nodes[i]!;
    const prev = tree.nodes[i - 1]!;
    if (n.isSpouse && prev.depth === n.depth) {
      const y = oy + n.y + n.height / 2;
      items.push({ kind: "line", points: [[ox + prev.x + prev.width, y], [ox + n.x, y]], stroke: C.line, width: 1.6 });
    }
  }
  // Cha mẹ → con: kéo lên giữa ô cha mẹ để nối vạch vợ chồng
  const nodeH = tree.nodes[0]?.height ?? 76;
  for (const e of tree.edges) {
    const [first, ...rest] = e.points;
    if (!first) continue;
    const pts: Pt[] = ([[first[0], first[1] - nodeH / 2], first, ...rest] as Pt[]).map(([x, y]) => [ox + x, oy + y]);
    items.push({
      kind: "line",
      points: pts,
      stroke: C.line,
      width: 1.6,
      ...(e.relation === "adopted" ? { dash: [6, 4] as [number, number] } : e.relation === "step" ? { dash: [2, 4] as [number, number] } : {}),
    });
  }

  // Thẻ người
  for (const n of tree.nodes) {
    const p = n.person;
    const x = ox + n.x;
    const y = oy + n.y;
    const outside = !p.inClan;
    const photo = p.avatarMediaId ? avatars.get(p.avatarMediaId) : undefined;
    if (!outside) items.push({ kind: "rect", x: x + 1, y: y + 2, w: n.width, h: n.height, r: 3, fill: "#ece4d6" });
    items.push({
      kind: "rect",
      x,
      y,
      w: n.width,
      h: n.height,
      r: 3,
      fill: outside ? C.cardOutside : C.card,
      stroke: outside ? C.borderOutside : C.border,
      strokeWidth: 1,
      ...(outside ? { dash: [4, 3] as [number, number] } : {}),
    });
    items.push({ kind: "rect", x, y, w: 4, h: n.height, fill: p.gender === "male" ? C.son : p.gender === "female" ? C.reu : C.ngoc300 });
    if (p.id === tree.rootId) items.push({ kind: "rect", x, y, w: n.width, h: 4, fill: C.thep });
    if (photo) items.push({ kind: "image", x: x + 10, y: y + 8, w: 46, h: n.height - 16, r: 3, jpeg: photo });
    const tx = x + (photo ? 64 : 14);
    const lines = wrapName(p.fullName, photo ? 13 : 18);
    lines.forEach((l, i) =>
      items.push({ kind: "text", x: tx, y: y + (lines.length === 1 ? 32 : 24) + i * 18, text: l, font: outside ? "serif" : "serifMedium", size: 15.5, fill: C.ink }),
    );
    const span = lifespan(p);
    if (span) items.push({ kind: "text", x: tx, y: y + n.height - 11, text: span, font: "sans", size: 12, fill: C.reu });
    if (n.hasHiddenChildren) items.push({ kind: "rect", x: x + n.width / 2 - 4, y: y + n.height + 4, w: 8, h: 8, r: 4, fill: C.reu });
  }

  // Chú thích cuối trang
  const fy = height - 26;
  let fx = PAD;
  const legend = (draw: (x: number) => void, label: string, w = 28) => {
    draw(fx);
    items.push({ kind: "text", x: fx + w + 6, y: fy + 4, text: label, font: "sans", size: 11, fill: C.reu });
    fx += w + 14 + textWidth(label, "sans", 11);
  };
  legend((x) => items.push({ kind: "line", points: [[x, fy], [x + 28, fy]], stroke: C.line, width: 1.6 }), "con ruột");
  legend((x) => items.push({ kind: "line", points: [[x, fy], [x + 28, fy]], stroke: C.line, width: 1.6, dash: [6, 4] }), "con nuôi");
  legend((x) => items.push({ kind: "line", points: [[x, fy], [x + 28, fy]], stroke: C.line, width: 1.6, dash: [2, 4] }), "con riêng");
  legend((x) => items.push({ kind: "rect", x, y: fy - 7, w: 24, h: 14, r: 2, fill: C.cardOutside, stroke: C.borderOutside, strokeWidth: 1, dash: [4, 3] }), "dâu, rể", 24);
  legend((x) => items.push({ kind: "rect", x: x + 8, y: fy - 4, w: 8, h: 8, r: 4, fill: C.reu }), "còn con cháu chưa in", 24);
  items.push({ kind: "text", x: width - PAD, y: fy + 4, text: "Gia Phả Cội Nguồn", font: "sans", size: 11, fill: C.reu, anchor: "end" });

  return { width, height, items, title: `Phả đồ ${clanName}` };
}

// ───────────── SVG ─────────────

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (v: number) => Number(v.toFixed(2));

/** Nhúng đúng các chữ cái đã dùng (bộ con của phông) để file SVG mở ở máy nào cũng đúng phông */
function embeddedFont(name: FontName, texts: string[]): string {
  const f = font(name);
  const subset = f.createSubset();
  const seen = new Set<number>();
  for (const t of texts) {
    for (const g of f.layout(t).glyphs) {
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      subset.includeGlyph(g);
    }
  }
  const b64 = Buffer.from(subset.encode()).toString("base64");
  return `@font-face{font-family:"${FAMILY[name]}";src:url(data:font/ttf;base64,${b64}) format("truetype");}`;
}
const FAMILY: Record<FontName, string> = { serif: "Alegreya GP", serifMedium: "Alegreya GP Medium", sans: "Be Vietnam Pro GP", sansBold: "Be Vietnam Pro GP SemiBold" };
const FALLBACK: Record<FontName, string> = {
  serif: "Alegreya, Georgia, serif",
  serifMedium: "Alegreya, Georgia, serif",
  sans: "'Be Vietnam Pro', system-ui, sans-serif",
  sansBold: "'Be Vietnam Pro', system-ui, sans-serif",
};

export function renderSvg(scene: Scene): string {
  const out: string[] = [];
  const texts = new Map<FontName, string[]>();
  for (const it of scene.items) if (it.kind === "text") (texts.get(it.font) ?? texts.set(it.font, []).get(it.font)!).push(it.text);
  const css = [...texts].map(([f, t]) => embeddedFont(f, t)).join("");
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${num(scene.width)}" height="${num(scene.height)}" viewBox="0 0 ${num(scene.width)} ${num(scene.height)}">`,
    `<title>${esc(scene.title)}</title>`,
    `<style>${css}</style>`,
    `<rect width="100%" height="100%" fill="${C.paper}"/>`,
  );
  let clip = 0;
  for (const it of scene.items) {
    if (it.kind === "rect") {
      out.push(
        `<rect x="${num(it.x)}" y="${num(it.y)}" width="${num(it.w)}" height="${num(it.h)}"${it.r ? ` rx="${it.r}"` : ""} fill="${it.fill ?? "none"}"${
          it.stroke ? ` stroke="${it.stroke}" stroke-width="${it.strokeWidth ?? 1}"` : ""
        }${it.dash ? ` stroke-dasharray="${it.dash.join(" ")}"` : ""}/>`,
      );
    } else if (it.kind === "line") {
      const d = it.points.map(([x, y], i) => `${i ? "L" : "M"}${num(x)} ${num(y)}`).join(" ");
      out.push(`<path d="${d}" fill="none" stroke="${it.stroke}" stroke-width="${it.width}" stroke-linejoin="round"${it.dash ? ` stroke-dasharray="${it.dash.join(" ")}"` : ""}/>`);
    } else if (it.kind === "text") {
      const anchor = it.anchor && it.anchor !== "start" ? ` text-anchor="${it.anchor}"` : "";
      out.push(
        `<text x="${num(it.x)}" y="${num(it.y)}" font-family="${esc(`"${FAMILY[it.font]}", ${FALLBACK[it.font]}`)}" font-size="${it.size}" fill="${it.fill}"${anchor}>${esc(it.text)}</text>`,
      );
    } else {
      const id = `c${clip++}`;
      out.push(
        `<clipPath id="${id}"><rect x="${num(it.x)}" y="${num(it.y)}" width="${num(it.w)}" height="${num(it.h)}" rx="${it.r}"/></clipPath>`,
        `<image x="${num(it.x)}" y="${num(it.y)}" width="${num(it.w)}" height="${num(it.h)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})" href="data:image/jpeg;base64,${it.jpeg.toString("base64")}"/>`,
      );
    }
  }
  out.push("</svg>");
  return out.join("\n");
}

// ───────────── PDF ─────────────

/** Khổ giấy (điểm in, 1 pt = 1/72 inch), theo chiều nằm ngang */
export const PAPERS = {
  A4: [841.89, 595.28],
  A3: [1190.55, 841.89],
  A2: [1683.78, 1190.55],
  A1: [2383.94, 1683.78],
  A0: [3370.39, 2383.94],
} as const;
export type Paper = keyof typeof PAPERS | "cuon";
export type PdfLayout = "tu-dong" | "mot-trang" | "nhieu-trang";

/** Chữ tên nhỏ nhất còn đọc được khi in (cỡ chữ tên 15.5 × tỉ lệ ≥ 6 pt) */
const MIN_READABLE_SCALE = 0.39;
/** Tỉ lệ khi chia nhiều trang: tên ≈ 9 pt, dễ đọc */
const TILE_SCALE = 0.58;
const MARGIN = 28;
/** Giấy cuộn (in bạt khổ lớn): tỉ lệ in, giới hạn khổ trang của PDF là 200 inch = 14 400 pt */
const ROLL_SCALE = 0.75;
const PDF_MAX = 14400;

export interface PdfPlan {
  pageW: number;
  pageH: number;
  scale: number;
  cols: number;
  rows: number;
}

/** Chọn khổ trang, chiều giấy, tỉ lệ và số trang ghép */
export function planPdf(scene: Scene, paper: Paper, layout: PdfLayout): PdfPlan {
  if (paper === "cuon") {
    const scale = Math.min(ROLL_SCALE, (PDF_MAX - 2 * MARGIN) / scene.width, (PDF_MAX - 2 * MARGIN) / scene.height);
    return { pageW: scene.width * scale + 2 * MARGIN, pageH: scene.height * scale + 2 * MARGIN, scale, cols: 1, rows: 1 };
  }
  const [long, short] = PAPERS[paper];
  const options = [
    [long, short],
    [short, long],
  ] as const;
  const fit = (w: number, h: number) => Math.min(1, (w - 2 * MARGIN) / scene.width, (h - 2 * MARGIN) / scene.height);
  // một trang: chiều giấy nào cho hình to hơn thì chọn
  const [ow, oh] = options.reduce((a, b) => (fit(b[0], b[1]) > fit(a[0], a[1]) ? b : a));
  const single = fit(ow, oh);
  if (layout === "mot-trang" || (layout === "tu-dong" && single >= MIN_READABLE_SCALE)) {
    return { pageW: ow, pageH: oh, scale: single, cols: 1, rows: 1 };
  }
  // nhiều trang ghép: chiều giấy nào ít trang hơn thì chọn
  const scale = Math.min(TILE_SCALE, 1);
  const count = ([w, h]: readonly [number, number]) => {
    // mỗi trang sau lặp lại lề "Đời n" nên phần cây mỗi trang hẹp hơn một lề
    const viewW = (w - 2 * MARGIN) / scale;
    const cols = scene.width <= viewW ? 1 : 1 + Math.ceil((scene.width - viewW) / (viewW - RAIL_BAND));
    const rows = Math.ceil((scene.height * scale) / (h - 2 * MARGIN));
    return { cols, rows, n: cols * rows };
  };
  const best = options.map((o) => ({ o, ...count(o) })).reduce((a, b) => (b.n < a.n ? b : a));
  return { pageW: best.o[0], pageH: best.o[1], scale, cols: best.cols, rows: best.rows };
}

/** Báo trước khi in: số trang, cỡ chữ tên khi in, kích thước bản in */
export function describePdf(scene: Scene, paper: Paper, layout: PdfLayout) {
  const plan = planPdf(scene, paper, layout);
  const ptToCm = (pt: number) => Math.round((pt / 72) * 2.54 * 10) / 10;
  return {
    pages: plan.cols * plan.rows,
    cols: plan.cols,
    rows: plan.rows,
    pageWidthCm: ptToCm(plan.pageW),
    pageHeightCm: ptToCm(plan.pageH),
    /** Chiều cao chữ tên khi in (mm) — dưới ~2 mm là khó đọc */
    nameHeightMm: Math.round(((15.5 * plan.scale) / 72) * 25.4 * 0.7 * 10) / 10,
    readable: plan.scale >= MIN_READABLE_SCALE,
  };
}

function bbox(it: Item): [number, number, number, number] {
  if (it.kind === "rect" || it.kind === "image") return [it.x, it.y, it.x + it.w, it.y + it.h];
  if (it.kind === "line") {
    const xs = it.points.map((p) => p[0]);
    const ys = it.points.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  const w = it.text.length * it.size * 0.62;
  const x0 = it.anchor === "middle" ? it.x - w / 2 : it.anchor === "end" ? it.x - w : it.x;
  return [x0, it.y - it.size, x0 + w, it.y + it.size * 0.3];
}

export async function renderPdf(scene: Scene, paper: Paper, layout: PdfLayout): Promise<Buffer> {
  const plan = planPdf(scene, paper, layout);
  const doc = new PDFDocument({
    autoFirstPage: false,
    margin: 0,
    compress: true,
    info: { Title: scene.title, Creator: "Gia Phả Cội Nguồn", Producer: "Gia Phả Cội Nguồn" },
  });
  for (const name of Object.keys(FONT_FILES) as FontName[]) doc.registerFont(name, fontData(name));
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const viewW = (plan.pageW - 2 * MARGIN) / plan.scale;
  const viewH = (plan.pageH - 2 * MARGIN) / plan.scale;
  const stepX = viewW - RAIL_BAND;
  const total = plan.cols * plan.rows;
  const boxes = scene.items.map(bbox);
  for (let r = 0; r < plan.rows; r++) {
    for (let c = 0; c < plan.cols; c++) {
      doc.addPage({ size: [plan.pageW, plan.pageH], margin: 0 });
      const vx = c * stepX;
      const vy = r * viewH;
      doc.save();
      doc.rect(MARGIN, MARGIN, plan.pageW - 2 * MARGIN, plan.pageH - 2 * MARGIN).clip();
      doc.translate(MARGIN, MARGIN).scale(plan.scale).translate(-vx, -vy);
      scene.items.forEach((it, i) => {
        const [x0, y0, x1, y1] = boxes[i]!;
        // bỏ những gì nằm ngoài trang này cho file nhẹ
        if (x1 < vx - 4 || x0 > vx + viewW + 4 || y1 < vy - 4 || y0 > vy + viewH + 4) return;
        if (it.kind === "text" && it.sticky && c > 0) return;
        drawPdfItem(doc, it);
      });
      if (c > 0) {
        // lặp lại lề "Đời n" ở mép trái để ghép trang nào cũng biết đời
        doc.rect(vx, vy, RAIL_BAND - 6, viewH).fill(C.paper);
        doc.moveTo(vx + RAIL_BAND - 6, vy).lineTo(vx + RAIL_BAND - 6, vy + viewH).lineWidth(1).stroke(C.thep);
        for (const it of scene.items) if (it.kind === "text" && it.sticky && it.y > vy - 30 && it.y < vy + viewH + 30) drawPdfItem(doc, { ...it, x: it.x + vx });
      }
      doc.restore();
      if (total > 1) {
        // nhãn trang để ghép: hàng, cột, và mép cần dán
        const label = `${scene.title} · trang ${r * plan.cols + c + 1}/${total} · hàng ${r + 1}, cột ${c + 1} (ghép: ${plan.rows} hàng × ${plan.cols} cột)`;
        doc.font("sans").fontSize(8).fillColor(C.reu).text(label, MARGIN, plan.pageH - MARGIN + 9, { lineBreak: false });
        doc.lineWidth(0.4).strokeColor(C.border).dash(2, { space: 2 }).rect(MARGIN, MARGIN, plan.pageW - 2 * MARGIN, plan.pageH - 2 * MARGIN).stroke().undash();
      }
    }
  }
  doc.end();
  return done;
}

function drawPdfItem(doc: PDFKit.PDFDocument, it: Item) {
  if (it.kind === "rect") {
    if (it.r) doc.roundedRect(it.x, it.y, it.w, it.h, it.r);
    else doc.rect(it.x, it.y, it.w, it.h);
    if (it.dash) doc.dash(it.dash[0], { space: it.dash[1] });
    if (it.fill && it.stroke) doc.lineWidth(it.strokeWidth ?? 1).fillAndStroke(it.fill, it.stroke);
    else if (it.fill) doc.fill(it.fill);
    else if (it.stroke) doc.lineWidth(it.strokeWidth ?? 1).stroke(it.stroke);
    if (it.dash) doc.undash();
  } else if (it.kind === "line") {
    const [first, ...rest] = it.points;
    if (!first) return;
    doc.moveTo(first[0], first[1]);
    for (const [x, y] of rest) doc.lineTo(x, y);
    doc.lineWidth(it.width).lineJoin("round");
    if (it.dash) doc.dash(it.dash[0], { space: it.dash[1] });
    doc.stroke(it.stroke);
    if (it.dash) doc.undash();
  } else if (it.kind === "text") {
    doc.font(it.font).fontSize(it.size).fillColor(it.fill);
    const w = it.anchor && it.anchor !== "start" ? doc.widthOfString(it.text) : 0;
    const x = it.anchor === "middle" ? it.x - w / 2 : it.anchor === "end" ? it.x - w : it.x;
    doc.text(it.text, x, it.y, { lineBreak: false, baseline: "alphabetic" });
  } else {
    doc.save();
    doc.roundedRect(it.x, it.y, it.w, it.h, it.r).clip();
    doc.image(it.jpeg, it.x, it.y, { cover: [it.w, it.h], align: "center", valign: "center" });
    doc.restore();
  }
}
