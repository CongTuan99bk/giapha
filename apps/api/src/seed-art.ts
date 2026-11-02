/**
 * Ảnh banner MINH HOẠ cho dữ liệu mẫu: tự vẽ bằng SVG (núi lớp, mái đình cách điệu, mặt trời) rồi chuyển sang JPEG.
 * Không dùng ảnh tải từ mạng để tránh vấn đề bản quyền. Dòng họ thật thay bằng ảnh của mình trong Cài đặt.
 */
import sharp from "sharp";

const W = 1920;
const H = 640;

interface Palette {
  sky: [string, string, string];
  sun: string;
  hills: [string, string, string];
  ink: string;
  ground: string;
}

const PALETTES: Record<string, Palette> = {
  binhMinh: { sky: ["#f6d9a8", "#e9a77c", "#8e4a3a"], sun: "#fbe7c2", hills: ["#b98572", "#7d5248", "#4a2f2a"], ink: "#2a1a17", ground: "#3a2420" },
  suongSom: { sky: ["#eef2ec", "#cfdccb", "#9db3a3"], sun: "#ffffff", hills: ["#b9c9b8", "#8ea592", "#5d7766"], ink: "#24352d", ground: "#2f4238" },
  hoangHon: { sky: ["#3b2733", "#8e2b21", "#d9884e"], sun: "#f3c86b", hills: ["#6e1f18", "#4a1712", "#2a0f0c"], ink: "#140806", ground: "#1d0b08" },
};

/** Đường núi mềm: các đỉnh ngẫu nhiên có hạt giống (vẽ lại giống hệt mỗi lần) */
function ridge(seed: number, base: number, amp: number): string {
  let x = 0;
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const pts: Array<[number, number]> = [[0, base - rnd() * amp]];
  while (x < W) {
    x += 140 + rnd() * 160;
    pts.push([Math.min(x, W), base - rnd() * amp]);
  }
  let d = `M0 ${H} L0 ${pts[0]![1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1]!;
    const [cx, cy] = pts[i]!;
    const mx = (px + cx) / 2;
    d += ` C${mx} ${py} ${mx} ${cy} ${cx} ${cy}`;
  }
  return `${d} L${W} ${H} Z`;
}

/** Mái đình hai tầng, đầu đao cong vút — hình cách điệu, không theo công trình có thật */
function temple(cx: number, baseY: number, scale: number, ink: string): string {
  const t = (x: number, y: number) => `${cx + x * scale} ${baseY + y * scale}`;
  return `
  <g fill="${ink}">
    <rect x="${cx - 190 * scale}" y="${baseY - 70 * scale}" width="${380 * scale}" height="${70 * scale}" opacity="0.92"/>
    ${[-150, -75, 0, 75, 150].map((x) => `<rect x="${cx + (x - 6) * scale}" y="${baseY - 70 * scale}" width="${12 * scale}" height="${70 * scale}" fill-opacity="0.6" fill="#000"/>`).join("")}
    <path d="M${t(-215, -68)} C${t(-245, -70)} ${t(-265, -85)} ${t(-270, -105)} C${t(-250, -95)} ${t(-230, -95)} ${t(-205, -100)} L${t(-150, -128)} L${t(150, -128)} L${t(205, -100)} C${t(230, -95)} ${t(250, -95)} ${t(270, -105)} C${t(265, -85)} ${t(245, -70)} ${t(215, -68)} Z"/>
    <rect x="${cx - 130 * scale}" y="${baseY - 150 * scale}" width="${260 * scale}" height="${24 * scale}"/>
    <path d="M${t(-150, -148)} C${t(-175, -150)} ${t(-190, -162)} ${t(-196, -180)} C${t(-178, -172)} ${t(-160, -172)} ${t(-140, -176)} L${t(-95, -205)} L${t(95, -205)} L${t(140, -176)} C${t(160, -172)} ${t(178, -172)} ${t(196, -180)} C${t(190, -162)} ${t(175, -150)} ${t(150, -148)} Z"/>
    <rect x="${cx - 100 * scale}" y="${baseY - 212 * scale}" width="${200 * scale}" height="${8 * scale}"/>
    <circle cx="${cx}" cy="${baseY - 222 * scale}" r="${9 * scale}"/>
    <path d="M${t(-100, -212)} q${-14 * scale} ${-4 * scale} ${-16 * scale} ${-18 * scale} q${10 * scale} ${4 * scale} ${16 * scale} ${10 * scale} Z"/>
    <path d="M${t(100, -212)} q${14 * scale} ${-4 * scale} ${16 * scale} ${-18 * scale} q${-10 * scale} ${4 * scale} ${-16 * scale} ${10 * scale} Z"/>
  </g>`;
}

function bambooClump(x: number, baseY: number, ink: string, seed: number): string {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  let out = "";
  for (let i = 0; i < 7; i++) {
    const bx = x + (rnd() - 0.5) * 90;
    const h = 220 + rnd() * 160;
    const lean = (rnd() - 0.5) * 60;
    out += `<path d="M${bx} ${baseY} Q${bx + lean / 2} ${baseY - h / 2} ${bx + lean} ${baseY - h}" stroke="${ink}" stroke-width="${5 + rnd() * 3}" fill="none" opacity="0.85"/>`;
    for (let j = 0; j < 6; j++) {
      const ly = baseY - h * (0.45 + j * 0.09);
      const lx = bx + lean * (0.45 + j * 0.09);
      const dir = j % 2 === 0 ? 1 : -1;
      out += `<path d="M${lx} ${ly} q${dir * 26} ${-8} ${dir * 52} ${6} q${-dir * 26} ${2} ${-dir * 52} ${-6} Z" fill="${ink}" opacity="0.8"/>`;
    }
  }
  return out;
}

export function bannerSvg(kind: keyof typeof PALETTES, seed: number): string {
  const p = PALETTES[kind]!;
  const sunX = kind === "hoangHon" ? 1450 : kind === "binhMinh" ? 520 : 1300;
  const sunY = kind === "hoangHon" ? 300 : 230;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.sky[0]}"/><stop offset="0.55" stop-color="${p.sky[1]}"/><stop offset="1" stop-color="${p.sky[2]}"/>
    </linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="${p.sun}" stop-opacity="0.9"/><stop offset="1" stop-color="${p.sun}" stop-opacity="0"/></radialGradient>
    <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}" stop-opacity="0"/><stop offset="1" stop-color="${p.sky[0]}" stop-opacity="0.55"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="${sunX}" cy="${sunY}" r="260" fill="url(#glow)"/>
  <circle cx="${sunX}" cy="${sunY}" r="70" fill="${p.sun}" opacity="0.95"/>
  <path d="${ridge(seed, 400, 170)}" fill="${p.hills[0]}" opacity="0.75"/>
  <rect y="300" width="${W}" height="200" fill="url(#mist)"/>
  <path d="${ridge(seed + 7, 470, 120)}" fill="${p.hills[1]}" opacity="0.9"/>
  ${temple(kind === "suongSom" ? 760 : 1040, 560, kind === "hoangHon" ? 1.25 : 1.05, p.ink)}
  <path d="${ridge(seed + 13, 585, 40)}" fill="${p.hills[2]}"/>
  ${bambooClump(kind === "suongSom" ? 1500 : 260, 600, p.ink, seed)}
  ${bambooClump(kind === "suongSom" ? 160 : 1720, 610, p.ink, seed + 3)}
  <rect y="600" width="${W}" height="40" fill="${p.ground}"/>
</svg>`;
}

/** 3 ảnh banner minh hoạ dạng JPEG */
export async function sampleBanners(): Promise<Array<{ caption: string; data: Buffer }>> {
  const items: Array<[keyof typeof PALETTES, string, number]> = [
    ["binhMinh", "Ảnh minh hoạ — thay bằng ảnh nhà thờ họ", 11],
    ["suongSom", "Ảnh minh hoạ — sương sớm quê nhà", 23],
    ["hoangHon", "Ảnh minh hoạ — hoàng hôn ngày giỗ tổ", 37],
  ];
  return Promise.all(
    items.map(async ([kind, caption, seed]) => ({
      caption,
      data: await sharp(Buffer.from(bannerSvg(kind, seed))).jpeg({ quality: 88 }).toBuffer(),
    })),
  );
}
