// Kiểm tra giấy phép của MỌI thư viện chạy production trong monorepo (kể cả phụ thuộc gián tiếp).
// Dùng `pnpm licenses list` vì license-checker không đọc được cấu trúc node_modules của pnpm.
// Chính sách (PROJECT_CONTEXT mục 12): chỉ giấy phép dễ dãi; ngoại lệ phải ghi rõ lý do bên dưới.
import { execFileSync } from "node:child_process";

const ALLOWED = new Set(["MIT", "MIT-0", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "BlueOak-1.0.0", "CC0-1.0", "Unlicense", "Python-2.0"]);

/** Ngoại lệ theo từng gói: [giấy phép, lý do] */
const EXCEPTIONS = {
  "@fontsource-variable/alegreya": ["OFL-1.1", "Font: OFL cho phép dùng thương mại, nhúng vào web"],
  "@fontsource/be-vietnam-pro": ["OFL-1.1", "Font: OFL cho phép dùng thương mại, nhúng vào web"],
  "caniuse-lite": ["CC-BY-4.0", "Dữ liệu trình duyệt dùng lúc build (Next.js), không phân phối lại"],
  "@img/sharp-libvips-linux-x64": ["LGPL-3.0-or-later", "Thư viện ảnh tuỳ chọn của Next.js, liên kết động, không sửa đổi"],
  "@img/sharp-libvips-linuxmusl-x64": ["LGPL-3.0-or-later", "Như trên (bản musl cho Docker Alpine)"],
  "@img/sharp-libvips-linux-arm64": ["LGPL-3.0-or-later", "Như trên (máy ARM)"],
  "@img/sharp-libvips-linuxmusl-arm64": ["LGPL-3.0-or-later", "Như trên (máy ARM, Alpine)"],
  "@img/sharp-libvips-darwin-arm64": ["LGPL-3.0-or-later", "Như trên (máy Mac của lập trình viên)"],
  "@img/sharp-libvips-darwin-x64": ["LGPL-3.0-or-later", "Như trên (máy Mac của lập trình viên)"],
};

const out = execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const byLicense = JSON.parse(out);
const problems = [];
let count = 0;
for (const [license, pkgs] of Object.entries(byLicense)) {
  for (const p of pkgs) {
    count++;
    if (ALLOWED.has(license)) continue;
    const ex = EXCEPTIONS[p.name];
    if (ex && ex[0] === license) continue;
    problems.push(`${p.name}@${(p.versions ?? []).join(",")} — ${license}`);
  }
}
if (problems.length) {
  console.error(`Giấy phép không nằm trong danh sách cho phép (${problems.length}):\n  ${problems.join("\n  ")}`);
  console.error("Thay thư viện khác, hoặc thêm ngoại lệ có lý do vào scripts/check-licenses.mjs sau khi đã xem xét.");
  process.exit(1);
}
console.log(`Giấy phép hợp lệ: ${count} gói production.`);
