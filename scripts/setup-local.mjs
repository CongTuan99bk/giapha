// Cài đặt lần đầu trên máy cá nhân (Windows / macOS / Linux): pnpm khoi-tao
// (không đặt tên "setup" vì trùng lệnh có sẵn của pnpm)
//   1. tạo .env từ .env.example nếu chưa có
//   2. chờ PostgreSQL (Docker) sẵn sàng
//   3. chạy migration
//   4. build toàn bộ
//   5. tạo dữ liệu mẫu GIẢ + tài khoản quản lý (bỏ qua nếu đã có dòng họ, hoặc khi chạy `pnpm khoi-tao --trong`)
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env");
const shell = process.platform === "win32";

function step(title) {
  console.log(`\n▶ ${title}`);
}
function run(cmd, args, extraEnv = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell, env: { ...process.env, ...extraEnv } });
  if (r.status !== 0) {
    console.error(`\n✗ Lệnh thất bại: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 9)) {
  console.error(`Cần Node.js 22.9 trở lên (máy đang có ${process.versions.node}). Tải tại https://nodejs.org`);
  process.exit(1);
}

step("Tệp cấu hình .env");
if (!existsSync(envFile)) {
  copyFileSync(join(root, ".env.example"), envFile);
  console.log("  Đã tạo .env từ .env.example");
} else {
  console.log("  Dùng .env có sẵn");
}
process.loadEnvFile(envFile);

step("Chờ PostgreSQL (Docker) sẵn sàng");
const require = createRequire(join(root, "packages/db/package.json"));
const pg = require("pg");
let ready = false;
for (let i = 0; i < 30 && !ready; i++) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query("select 1");
    ready = true;
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  } finally {
    await client.end().catch(() => undefined);
  }
}
if (!ready) {
  console.error("  Không kết nối được PostgreSQL. Hãy bật Docker Desktop rồi chạy: pnpm dev:infra");
  process.exit(1);
}
console.log("  PostgreSQL đã sẵn sàng");

if (process.env.SETUP_SKIP_MIGRATE !== "1") {
  step("Tạo bảng (migration)");
  run("pnpm", ["--filter", "@coinguon/db", "migrate:deploy"]);
}

step("Build");
run("pnpm", ["build"]);

step("Dữ liệu mẫu (giả)");
const check = new pg.Client({ connectionString: process.env.DATABASE_URL });
await check.connect();
const { rows } = await check.query("select count(*)::int as n from clans");
await check.end();
if (process.argv.includes("--trong")) {
  console.log("  Bỏ qua (--trong). Vào http://localhost:3000/dang-ky — người đăng ký đầu tiên sẽ tạo dòng họ.");
} else if (rows[0].n > 0) {
  console.log("  Đã có dòng họ — bỏ qua bước tạo dữ liệu mẫu.");
} else {
  run("pnpm", ["--filter", "@coinguon/api", "seed"]);
}

console.log(`
✓ Xong. Chạy ứng dụng:  pnpm dev
  Mở trình duyệt:       http://localhost:3000
`);
