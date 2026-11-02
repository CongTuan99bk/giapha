#!/usr/bin/env node
// Vẽ hoạ tiết "lưỡng long chầu nguyệt" (hai rồng chầu ngọc/trăng) + mây cuộn làm nền chìm cho phả đồ.
// Hình do chương trình này tự dựng (không dùng ảnh có bản quyền). Một màu (currentColor-free: tô bằng MAU),
// độ mờ do CSS quyết định.
//
//   node scripts/ve-hoa-van.mjs   → apps/web/public/hoa-van/luong-long.svg
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = 1600;
const H = 900;
const CX = W / 2;
const MAU = "#3a2a1c";
const f = (n) => Math.round(n * 10) / 10;

// ───────── tiện ích hình học ─────────

/** Đường Catmull–Rom qua các điểm điều khiển → mảng điểm dày */
function spline(pts, perSeg = 60) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a, b, c2, d) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function tangents(pts) {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  });
}

const poly = (pts, close = false) => `M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join("L")}${close ? "Z" : ""}`;

/** Xoắn ốc (mây cuộn, râu, móng): tâm, bán kính đầu, số vòng, chiều, góc bắt đầu */
function spiral(cx, cy, r0, turns, dir = 1, start = 0, steps = 60) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + dir * t * turns * Math.PI * 2;
    const r = r0 * (1 - t * 0.85);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// ───────── rồng ─────────

/**
 * Một con rồng nhìn sang phải, đầu ở điểm đầu tiên của `spine`.
 * Thân: hai mép (vẽ nét), vảy hình vòng cung, vây lưng răng cưa, chân có móng, vây lửa.
 */
function dragon(spine) {
  const body = spline(spine, 70);
  const tan = tangents(body);
  const n = body.length;
  const width = (i) => {
    const t = i / (n - 1);
    return 40 * Math.pow(1 - t, 0.75) + 3 + 10 * Math.exp(-((t - 0.08) ** 2) / 0.004); // cổ phình nhẹ
  };
  // pháp tuyến: "lưng" là bên trái theo chiều đầu → đuôi
  const side = (i, s) => {
    const [tx, ty] = tan[i];
    const w = width(i) / 2;
    return [body[i][0] - ty * w * s, body[i][1] + tx * w * s];
  };
  const back = body.map((_, i) => side(i, 1));
  const belly = body.map((_, i) => side(i, -1));
  const parts = [];
  const start = 22; // thân bắt đầu sau cổ (đầu vẽ riêng)

  // hai mép thân
  parts.push(`<path d="${poly(back.slice(start))}" stroke-width="3.2"/>`);
  parts.push(`<path d="${poly(belly.slice(start))}" stroke-width="3.2"/>`);
  // chóp đuôi: vây đuôi xoè hình ngọn lửa
  const [ex, ey] = body[n - 1];
  const [etx, ety] = tan[n - 1];
  const ang = Math.atan2(ety, etx);
  for (const k of [-1, 0, 1]) {
    const a = ang + k * 0.55;
    const tip = [ex + Math.cos(a) * 55, ey + Math.sin(a) * 55];
    const ctl = [ex + Math.cos(a + 0.5) * 30, ey + Math.sin(a + 0.5) * 30];
    parts.push(`<path d="M${f(ex)} ${f(ey)}Q${f(ctl[0])} ${f(ctl[1])} ${f(tip[0])} ${f(tip[1])}" stroke-width="2.6"/>`);
    parts.push(`<path d="${poly(spiral(tip[0], tip[1], 9, 0.9, k >= 0 ? 1 : -1, a))}" stroke-width="2.2"/>`);
  }

  // vảy: các cung nhỏ xếp so le dọc thân
  for (let i = start + 6; i < n - 12; i += 7) {
    const w = width(i);
    const rows = w > 26 ? [-0.25, 0.2] : [0];
    for (const r of rows) {
      const [tx, ty] = tan[i];
      const cx = body[i][0] - ty * w * r + tx * ((i / 7) % 2 ? 3 : 0);
      const cy = body[i][1] + tx * w * r + ty * ((i / 7) % 2 ? 3 : 0);
      const rr = Math.max(4, w * 0.22);
      const a = Math.atan2(ty, tx) + Math.PI; // cung mở về phía đuôi
      const p1 = [cx + Math.cos(a - 1.3) * rr, cy + Math.sin(a - 1.3) * rr];
      const p2 = [cx + Math.cos(a + 1.3) * rr, cy + Math.sin(a + 1.3) * rr];
      parts.push(`<path d="M${f(p1[0])} ${f(p1[1])}A${f(rr)} ${f(rr)} 0 0 1 ${f(p2[0])} ${f(p2[1])}" stroke-width="1.6"/>`);
    }
  }
  // khoang bụng: một đường chạy song song sát mép bụng
  parts.push(`<path d="${poly(body.slice(start, n - 10).map((_, k) => {
    const i = k + start;
    const [tx, ty] = tan[i];
    const w = width(i) * 0.36;
    return [body[i][0] + ty * w, body[i][1] - tx * w];
  }))}" stroke-width="1.4"/>`);
  // vây lưng răng cưa
  const fins = [];
  for (let i = start + 4; i < n - 10; i += 11) {
    const [tx, ty] = tan[i];
    const h = Math.max(7, width(i) * 0.62);
    const a = back[i];
    const b = back[Math.min(n - 1, i + 11)];
    const tip = [a[0] - ty * h + tx * h * 0.6, a[1] + tx * h + ty * h * 0.6];
    fins.push(`M${f(a[0])} ${f(a[1])}Q${f(tip[0] - tx * 4)} ${f(tip[1] - ty * 4)} ${f(tip[0])} ${f(tip[1])}L${f(b[0])} ${f(b[1])}`);
  }
  parts.push(`<path d="${fins.join("")}" stroke-width="2"/>`);

  // vây lửa ở khuỷu thân
  for (const t of [0.32, 0.58, 0.8]) {
    const i = Math.round(t * (n - 1));
    const [bx, by] = back[i];
    const [tx, ty] = tan[i];
    const s = width(i) * 1.8 + 30;
    const tip = [bx - ty * s - tx * s * 0.8, by + tx * s - ty * s * 0.8];
    const mid = [bx - ty * s * 0.6 + tx * s * 0.3, by + tx * s * 0.6 + ty * s * 0.3];
    parts.push(`<path d="M${f(bx)} ${f(by)}Q${f(mid[0])} ${f(mid[1])} ${f(tip[0])} ${f(tip[1])}" stroke-width="2.4"/>`);
    parts.push(`<path d="${poly(spiral(tip[0], tip[1], 8, 1, -1, Math.atan2(ty, tx)))}" stroke-width="2"/>`);
  }

  // chân: hai chân trước, hai chân sau, mỗi chân 4 móng cong
  for (const [t, dir] of [
    [0.16, 1],
    [0.22, -1],
    [0.5, 1],
    [0.56, -1],
  ]) {
    const i = Math.round(t * (n - 1));
    const [bx, by] = belly[i];
    const [tx, ty] = tan[i];
    const len = 34 + width(i) * 0.7;
    // khuỷu chân đưa ra sau và xuống
    const knee = [bx + ty * len * 0.7 - tx * len * 0.5 * dir, by - tx * len * 0.7 - ty * len * 0.5 * dir];
    const paw = [knee[0] + ty * len * 0.6 + tx * len * 0.5 * dir, knee[1] - tx * len * 0.6 + ty * len * 0.5 * dir];
    parts.push(`<path d="M${f(bx)} ${f(by)}Q${f(knee[0])} ${f(knee[1])} ${f(paw[0])} ${f(paw[1])}" stroke-width="5" stroke-linecap="round"/>`);
    // lông khuỷu
    parts.push(`<path d="${poly(spiral(knee[0], knee[1], 7, 0.8, dir, 0))}" stroke-width="1.8"/>`);
    for (let c = -1.5; c <= 1.5; c++) {
      const a = Math.atan2(paw[1] - knee[1], paw[0] - knee[0]) + c * 0.42;
      const p1 = [paw[0] + Math.cos(a) * 18, paw[1] + Math.sin(a) * 18];
      const p2 = [p1[0] + Math.cos(a + 1.3 * dir) * 10, p1[1] + Math.sin(a + 1.3 * dir) * 10];
      parts.push(`<path d="M${f(paw[0])} ${f(paw[1])}L${f(p1[0])} ${f(p1[1])}Q${f(p1[0] + Math.cos(a) * 4)} ${f(p1[1] + Math.sin(a) * 4)} ${f(p2[0])} ${f(p2[1])}" stroke-width="2.2"/>`);
    }
  }

  // đầu: vẽ trong hệ toạ độ riêng (mõm hướng +x), đặt ở điểm đầu sống lưng
  const [hx, hy] = body[0];
  const [htx, hty] = tan[0];
  const rot = (Math.atan2(-hty, -htx) * 180) / Math.PI; // đầu nhìn ngược chiều thân
  parts.push(`<g transform="translate(${f(hx)} ${f(hy)}) rotate(${f(rot)}) scale(1.5)">${head()}</g>`);
  return parts.join("");
}

/** Đầu rồng (mõm hướng +x), gốc toạ độ ở gáy */
function head() {
  const p = [];
  // hàm trên: trán gồ, mũi hếch cuộn
  p.push(`<path d="M-8 -22C14 -40 40 -34 56 -24C70 -16 86 -20 98 -12" stroke-width="3.4"/>`);
  p.push(`<path d="${poly(spiral(100, -24, 12, 1.1, -1, Math.PI / 2))}" stroke-width="2.6"/>`);
  // hàm dưới há rộng
  p.push(`<path d="M-4 20C20 28 46 34 74 30C84 29 90 24 92 18" stroke-width="3.2"/>`);
  p.push(`<path d="M98 -8C88 -2 72 2 56 4" stroke-width="2.4"/>`);
  // răng nanh
  p.push(`<path d="M80 -6L84 6M66 -2L68 10M76 26L78 15" stroke-width="2"/>`);
  // lưỡi cong
  p.push(`<path d="M50 10C70 12 84 8 104 16C110 19 112 25 106 28" stroke-width="2"/>`);
  // mắt và mày
  p.push(`<circle cx="40" cy="-16" r="7" stroke-width="2.4"/><circle cx="41" cy="-16" r="2.4" fill="${MAU}" stroke="none"/>`);
  p.push(`<path d="M24 -30C34 -40 50 -38 58 -28" stroke-width="2.4"/>`);
  // sừng hươu chạc đôi ngả ra sau
  p.push(`<path d="M18 -34C8 -60 -18 -80 -52 -86M-10 -66C-14 -78 -10 -90 -2 -98M-30 -79C-40 -88 -42 -100 -38 -108" stroke-width="3"/>`);
  // bờm lửa xoè ra sau
  for (let k = 0; k < 4; k++) {
    const y0 = -14 + k * 9;
    const tipX = -52 - (k % 2) * 12;
    const tipY = -40 + k * 24;
    p.push(`<path d="M${0} ${y0}C${-20} ${y0 - 6} ${-44} ${tipY + 4} ${tipX} ${tipY}" stroke-width="2.4"/>`);
    p.push(`<path d="${poly(spiral(tipX, tipY, 7, 0.9, k % 2 ? 1 : -1, 0))}" stroke-width="1.8"/>`);
  }
  // râu dài uốn ngược ra sau (không che ngọc), cuộn ở chóp
  p.push(`<path d="M92 -16C104 -44 80 -58 60 -62C36 -66 30 -84 44 -96" stroke-width="2.4"/>`);
  p.push(`<path d="${poly(spiral(50, -100, 9, 1.1, 1, Math.PI))}" stroke-width="2"/>`);
  p.push(`<path d="M86 26C96 52 74 66 52 70C30 74 24 92 36 102" stroke-width="2.4"/>`);
  p.push(`<path d="${poly(spiral(42, 106, 8, 1.1, -1, Math.PI))}" stroke-width="2"/>`);
  // chòm râu cằm
  p.push(`<path d="M30 30C26 48 34 60 22 74M42 32C42 52 52 60 44 80" stroke-width="2"/>`);
  return p.join("");
}

// ───────── ngọc / trăng ở giữa ─────────

function pearl(cx, cy) {
  const p = [];
  p.push(`<circle cx="${cx}" cy="${cy}" r="62" stroke-width="3.2"/>`);
  p.push(`<circle cx="${cx}" cy="${cy}" r="48" stroke-width="1.6"/>`);
  p.push(`<path d="${poly(spiral(cx, cy, 34, 1.6, 1, 0, 80))}" stroke-width="2.4"/>`);
  // lửa ngọc: các lưỡi lửa uốn quanh
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const r1 = 68;
    const r2 = 108 + (k % 2) * 18;
    const p1 = [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1];
    const tip = [cx + Math.cos(a + 0.25) * r2, cy + Math.sin(a + 0.25) * r2];
    const ctl = [cx + Math.cos(a - 0.12) * (r1 + r2) * 0.55, cy + Math.sin(a - 0.12) * (r1 + r2) * 0.55];
    p.push(`<path d="M${f(p1[0])} ${f(p1[1])}Q${f(ctl[0])} ${f(ctl[1])} ${f(tip[0])} ${f(tip[1])}" stroke-width="2.2"/>`);
  }
  return p.join("");
}

// ───────── mây cuộn ─────────

function cloud(cx, cy, s, flip = 1) {
  const p = [];
  // ba cuộn xoắn to nhỏ, nối bằng một đường lượn bên dưới
  const spirals = [
    [0, 0, 22],
    [36, -10, 16],
    [-30, -6, 13],
  ];
  for (const [dx, dy, r] of spirals) {
    p.push(`<path d="${poly(spiral(cx + dx * s * flip, cy + dy * s, r * s, 1.4, flip, Math.PI / 2, 70))}" stroke-width="2.4"/>`);
  }
  p.push(
    `<path d="M${f(cx - 52 * s * flip)} ${f(cy + 14 * s)}C${f(cx - 20 * s * flip)} ${f(cy + 30 * s)} ${f(cx + 30 * s * flip)} ${f(cy + 30 * s)} ${f(cx + 70 * s * flip)} ${f(cy + 10 * s)}C${f(cx + 90 * s * flip)} ${f(cy)} ${f(cx + 110 * s * flip)} ${f(cy + 14 * s)} ${f(cx + 130 * s * flip)} ${f(cy + 8 * s)}" stroke-width="2.4"/>`,
  );
  p.push(`<path d="M${f(cx - 40 * s * flip)} ${f(cy + 24 * s)}C${f(cx)} ${f(cy + 40 * s)} ${f(cx + 50 * s * flip)} ${f(cy + 34 * s)} ${f(cx + 90 * s * flip)} ${f(cy + 26 * s)}" stroke-width="1.6"/>`);
  return p.join("");
}

// ───────── bố cục ─────────

const PEARL_Y = 300;
// sống lưng rồng trái: đầu sát ngọc, thân uốn chữ S về bên trái, đuôi vút lên
const leftSpine = [
  [575, 345],
  [520, 410],
  [470, 500],
  [400, 560],
  [320, 520],
  [290, 420],
  [250, 330],
  [180, 300],
  [120, 360],
  [110, 450],
  [70, 500],
];

const content = [
  `<g>${pearl(CX, PEARL_Y)}</g>`,
  `<g>${dragon(leftSpine)}</g>`,
  `<g transform="translate(${W} 0) scale(-1 1)">${dragon(leftSpine)}</g>`,
  cloud(CX - 40, 560, 1.3),
  cloud(CX + 40, 160, 0.9, -1),
  cloud(520, 150, 1),
  cloud(W - 520, 150, 1, -1),
  cloud(210, 690, 1.1),
  cloud(W - 210, 690, 1.1, -1),
  cloud(560, 700, 0.8, -1),
  cloud(W - 560, 700, 0.8),
].join("\n");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Lưỡng long chầu nguyệt — hoạ tiết nền phả đồ, sinh bởi scripts/ve-hoa-van.mjs -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" stroke="${MAU}" stroke-linecap="round" stroke-linejoin="round">
${content}
</svg>
`;

const out = join(dirname(fileURLToPath(import.meta.url)), "../apps/web/public/hoa-van/luong-long.svg");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, svg);
console.log(`Đã vẽ ${out} (${(svg.length / 1024).toFixed(0)} KB)`);
