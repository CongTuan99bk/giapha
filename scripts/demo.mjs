#!/usr/bin/env node
// Chạy bản demo trên máy cá nhân bằng Docker + Cloudflare Quick Tunnel (miễn phí, không cần tài khoản, không cần tên miền).
//
//   pnpm demo                  build + chạy, in link https://….trycloudflare.com để gửi cho người khác
//   pnpm demo --du-lieu-mau    như trên, và tạo dữ liệu GIẢ (60 người, banner) nếu chưa có dòng họ
//   pnpm demo:link             in lại link hiện tại
//   pnpm demo:sao-luu          sao lưu ngay (CSDL + ảnh) vào thư mục backups/
//   pnpm demo:nhat-ky          xem nhật ký máy chủ (Ctrl+C để thoát)
//   pnpm demo:dung             dừng (giữ nguyên dữ liệu; chạy pnpm demo để bật lại)
//
// Lưu ý: link đổi mỗi lần tunnel khởi động lại; máy tính phải bật thì người khác mới vào được.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env.demo");
const compose = ["compose", "-f", "infra/docker/compose.prod.yml", "--env-file", ".env.demo", "--profile", "tunnel"];
const [cmd = "start", ...flags] = process.argv.slice(2).filter((a) => a !== "--");

function docker(args, opts = {}) {
  const r = spawnSync("docker", args, { cwd: root, encoding: "utf8", stdio: opts.capture ? "pipe" : "inherit" });
  if (r.error) {
    console.error("Không chạy được lệnh docker. Hãy cài Docker Desktop (https://www.docker.com/products/docker-desktop/) và mở nó lên.");
    process.exit(1);
  }
  if (r.status !== 0 && !opts.allowFail) {
    if (opts.capture) console.error(r.stderr);
    console.error(`\n✗ Lỗi khi chạy: docker ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
  return r;
}

function readEnv() {
  const out = {};
  if (!existsSync(envFile)) return out;
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function writeEnv(env) {
  const header = "# Cấu hình bản demo — sinh tự động bởi `pnpm demo`. KHÔNG đưa file này lên GitHub.\n";
  writeFileSync(envFile, header + Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
}

function ensureEnv() {
  const env = readEnv();
  const secret = () => randomBytes(24).toString("hex"); // chỉ chữ số hex: an toàn khi ghép vào URL kết nối CSDL
  const defaults = {
    DB_PASSWORD: secret(),
    APP_DB_PASSWORD: secret(),
    PLATFORM_DB_PASSWORD: secret(),
    COOKIE_SECURE: "true",
    CLAN_MODE: "single",
    // Sau Cloudflare: lấy IP thật của người dùng từ header này (chặn dò mật khẩu theo IP)
    CLIENT_IP_HEADER: "cf-connecting-ip",
    PUBLIC_URL: "",
    SMTP_URL: "",
    SEED_EMAIL: "quanly@giapha.test",
    SEED_PASSWORD: randomBytes(9).toString("base64url"),
    BACKUP_HOUR: "2",
    BACKUP_KEEP_DAYS: "14",
  };
  let changed = !existsSync(envFile);
  for (const [k, v] of Object.entries(defaults)) {
    if (env[k] === undefined) {
      env[k] = v;
      changed = true;
    }
  }
  if (changed) writeEnv(env);
  return env;
}

function currentLink() {
  const r = docker([...compose, "logs", "--no-color", "tunnel"], { capture: true, allowFail: true });
  const all = `${r.stdout ?? ""}${r.stderr ?? ""}`.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
  return all ? all[all.length - 1] : null;
}

async function waitForLink(timeoutSec = 120) {
  for (let i = 0; i < timeoutSec / 3; i++) {
    const link = currentLink();
    if (link) return link;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

if (cmd === "stop") {
  docker([...compose, "stop"]);
  console.log("\nĐã dừng. Dữ liệu vẫn còn — chạy `pnpm demo` để bật lại (link mới sẽ khác).");
} else if (cmd === "logs") {
  docker([...compose, "logs", "-f", "--tail", "100", "api", "web", "tunnel"]);
} else if (cmd === "backup") {
  docker([...compose, "exec", "backup", "/bin/sh", "/backup.sh", "now"]);
  console.log("\nFile sao lưu nằm trong thư mục backups/ của repo.");
} else if (cmd === "link") {
  const link = currentLink();
  console.log(link ? `Link hiện tại: ${link}` : "Chưa có link — bản demo có đang chạy không? (pnpm demo)");
} else if (cmd === "start") {
  const env = ensureEnv();
  console.log("▶ Build và khởi động (lần đầu mất vài phút để tải và build)…\n");
  docker([...compose, "up", "-d", "--build"]);

  console.log("\n▶ Đang lấy link chia sẻ từ Cloudflare…");
  const link = await waitForLink();
  if (link && env.PUBLIC_URL !== link) {
    // Link mới → cập nhật địa chỉ dùng trong email (link đặt lại mật khẩu) và khởi động lại API
    env.PUBLIC_URL = link;
    writeEnv(env);
    docker([...compose, "up", "-d", "api"]);
  }

  if (flags.includes("--du-lieu-mau")) {
    const r = docker([...compose, "exec", "-T", "db", "psql", "-U", "coinguon", "-d", "coinguon", "-Atc", "select count(*) from clans"], {
      capture: true,
    });
    if (r.stdout.trim() === "0") {
      console.log("\n▶ Tạo dữ liệu mẫu (giả)…");
      docker([...compose, "run", "--rm", "-e", `SEED_EMAIL=${env.SEED_EMAIL}`, "-e", `SEED_PASSWORD=${env.SEED_PASSWORD}`, "api", "node", "dist/seed.js"]);
    } else {
      console.log("\nĐã có dòng họ — không tạo dữ liệu mẫu.");
    }
  }

  console.log(`
✓ Bản demo đang chạy.
  Link gửi cho người khác: ${link ?? "(chưa lấy được — chạy lại `pnpm demo:link` sau ít phút)"}
  Trên máy này:            http://localhost:${env.WEB_PORT || 3000}
${
  flags.includes("--du-lieu-mau")
    ? `  Tài khoản dữ liệu mẫu:   ${env.SEED_EMAIL} / ${env.SEED_PASSWORD}`
    : "  Lần đầu: mở link → Tạo tài khoản → bạn là người tạo dòng họ (quản lý chính)."
}
  Sao lưu tự động lúc ${env.BACKUP_HOUR}:00 hằng ngày vào thư mục backups/ (máy phải đang bật).
  Dừng: pnpm demo:dung — link đổi mỗi lần khởi động lại.`);
} else {
  console.error(`Lệnh không rõ: ${cmd}. Dùng: start | stop | logs | link | backup`);
  process.exit(1);
}
