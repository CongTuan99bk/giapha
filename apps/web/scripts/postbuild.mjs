// Bản standalone của Next không kèm file tĩnh: chép .next/static và public vào để chạy được
// bằng `node .next/standalone/apps/web/server.js` (dùng cho Docker và test e2e).
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, ".next/standalone/apps/web");
if (!existsSync(target)) {
  console.error("Không thấy .next/standalone — hãy chạy next build trước");
  process.exit(1);
}
cpSync(join(root, ".next/static"), join(target, ".next/static"), { recursive: true });
cpSync(join(root, "public"), join(target, "public"), { recursive: true });
