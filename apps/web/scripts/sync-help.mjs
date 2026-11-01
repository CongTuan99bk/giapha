// Chép hướng dẫn sử dụng (nguồn: docs/help) vào content/help để trang /tro-giup đọc khi build.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../../../docs/help/huong-dan-su-dung.md");
const dest = join(here, "../content/help/huong-dan-su-dung.md");
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
