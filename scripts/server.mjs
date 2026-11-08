#!/usr/bin/env node
// Chạy server Gia Phả Cội Nguồn bằng Docker — một lệnh: dọn server cũ, build, chạy server mới, in link chia sẻ.
//
//   pnpm chay --mau          Dữ liệu MẪU (giả): xoá sạch server + dữ liệu mẫu cũ, tạo lại 60 người giả. Để thử, để demo.
//   pnpm chay --that         Dữ liệu THẬT: sao lưu, dỡ server cũ, build bản mới nhất, chạy lại. Dữ liệu giữ nguyên.
//
//   Tuỳ chọn thêm:
//     --khong-link             không mở link Cloudflare (chỉ xem trên máy này: http://localhost:3000)
//     --xoa-du-lieu-cu         (với --that) XOÁ dữ liệu đang có rồi bắt đầu trống — đã sao lưu trước khi xoá
//
//   pnpm chay:link           in lại link chia sẻ của server đang chạy
//   pnpm chay:nhat-ky        xem nhật ký (Ctrl+C để thoát)
//   pnpm chay:sao-luu        sao lưu ngay (CSDL + ảnh)
//   pnpm chay:dung           dừng server (giữ dữ liệu)
//
// Dữ liệu mẫu và dữ liệu thật nằm ở hai bộ dữ liệu Docker riêng (project "coinguon-mau" và "coinguon"),
// mật khẩu riêng (.env.demo và .env.that), thư mục sao lưu riêng — chạy mẫu không bao giờ đụng tới dữ liệu thật.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2).filter((a) => a !== "--");
const cmd = args.find((a) => !a.startsWith("--")) ?? "start";
const flag = (f) => args.includes(f);

const MODES = {
  mau: {
    label: "DỮ LIỆU MẪU (giả)",
    project: "coinguon-mau",
    envFile: ".env.demo",
    backupDir: "../../backups/du-lieu-mau",
  },
  that: {
    label: "DỮ LIỆU THẬT",
    project: "coinguon",
    envFile: ".env.that",
    backupDir: "../../backups",
  },
};

// ───────── tiện ích ─────────

function docker(argv, opts = {}) {
  const r = spawnSync("docker", argv, { cwd: root, encoding: "utf8", stdio: opts.capture ? "pipe" : "inherit" });
  if (r.error) {
    console.error("✗ Không chạy được lệnh docker. Hãy cài Docker Desktop (https://www.docker.com/products/docker-desktop/) và mở nó lên.");
    process.exit(1);
  }
  if (r.status !== 0 && !opts.allowFail) {
    if (opts.capture) console.error(r.stderr);
    console.error(`\n✗ Lỗi khi chạy: docker ${argv.join(" ")}`);
    process.exit(r.status ?? 1);
  }
  return r;
}

function composeArgs(mode, withTunnel = true) {
  const m = MODES[mode];
  return ["compose", "-p", m.project, "-f", "infra/docker/compose.prod.yml", "--env-file", m.envFile, ...(withTunnel ? ["--profile", "tunnel"] : [])];
}

function step(text) {
  console.log(`\n▶ ${text}`);
}

/** Docker Desktop đã chạy chưa (cài rồi nhưng chưa mở là lỗi hay gặp nhất) */
function checkDocker() {
  const r = docker(["info", "--format", "{{.ServerVersion}}"], { capture: true, allowFail: true });
  if (r.status !== 0) {
    console.error('✗ Docker chưa chạy. Mở Docker Desktop, đợi tới khi báo "Engine running", rồi chạy lại lệnh.');
    process.exit(1);
  }
}

/** Git trên Windows có thể đổi file sang CRLF; script chạy trong container Linux sẽ hỏng → đổi lại LF */
function fixLineEndings() {
  const fixed = [];
  const walk = (rel) => {
    for (const name of readdirSync(join(root, rel))) {
      const r = join(rel, name);
      const full = join(root, r);
      if (statSync(full).isDirectory()) walk(r);
      else if (/\.(sh|ya?ml)$|Caddyfile$|Dockerfile$/.test(name)) {
        const text = readFileSync(full, "utf8");
        if (text.includes("\r\n")) {
          writeFileSync(full, text.replace(/\r\n/g, "\n"));
          fixed.push(r);
        }
      }
    }
  };
  walk("infra/docker");
  if (fixed.length) console.log(`  Đã sửa kiểu xuống dòng (CRLF → LF): ${fixed.join(", ")}`);
}

function readEnv(file) {
  const out = {};
  const path = join(root, file);
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function writeEnv(file, env, title) {
  const header = `# ${title} — sinh tự động bởi \`pnpm chay\`. KHÔNG đưa file này lên GitHub.\n`;
  writeFileSync(join(root, file), header + Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
}

/**
 * Gỡ toàn bộ container (và mạng) của một project theo nhãn Docker Compose — không cần file env,
 * nên gỡ được cả server của bản `pnpm demo` cũ. `volumes: true` thì xoá luôn dữ liệu của project đó.
 */
function teardown(project, { volumes = false } = {}) {
  const ids = (kind, extra = []) =>
    docker([kind, "ls", "-q", ...extra, "--filter", `label=com.docker.compose.project=${project}`], { capture: true, allowFail: true })
      .stdout.split(/\s+/)
      .filter(Boolean);
  const containers = ids("container", ["-a"]);
  if (containers.length) docker(["rm", "-f", ...containers], { capture: true, allowFail: true });
  const networks = ids("network");
  if (networks.length) docker(["network", "rm", ...networks], { capture: true, allowFail: true });
  if (volumes) {
    const vols = ids("volume");
    if (vols.length) docker(["volume", "rm", "-f", ...vols], { capture: true, allowFail: true });
  }
  return containers.length;
}

const volumeExists = (name) => docker(["volume", "inspect", name], { capture: true, allowFail: true }).status === 0;
const isRunning = (project) =>
  docker(["ps", "-q", "--filter", `label=com.docker.compose.project=${project}`], { capture: true, allowFail: true }).stdout.trim() !== "";

/** File cấu hình cho từng chế độ; mật khẩu sinh một lần và giữ nguyên (CSDL đã tạo với mật khẩu nào thì phải dùng đúng mật khẩu đó) */
function ensureEnv(mode) {
  const m = MODES[mode];
  const env = readEnv(m.envFile);
  const secret = () => randomBytes(24).toString("hex");
  let inherited = false;
  if (mode === "that" && !env.DB_PASSWORD && volumeExists("coinguon_pgdata")) {
    // Bản cũ (pnpm demo trước đây) đã tạo CSDL "coinguon" bằng mật khẩu trong .env.demo → dùng lại để còn mở được
    const old = readEnv(".env.demo");
    for (const k of ["DB_PASSWORD", "APP_DB_PASSWORD", "PLATFORM_DB_PASSWORD"]) if (old[k]) env[k] = old[k];
    inherited = Boolean(old.DB_PASSWORD);
  }
  const defaults = {
    DB_PASSWORD: secret(),
    APP_DB_PASSWORD: secret(),
    PLATFORM_DB_PASSWORD: secret(),
    COOKIE_SECURE: "true",
    CLAN_MODE: "single",
    // Sau Cloudflare: lấy IP thật của người dùng (chặn dò mật khẩu theo IP)
    CLIENT_IP_HEADER: "cf-connecting-ip",
    PUBLIC_URL: "",
    SMTP_URL: "",
    BACKUP_DIR: m.backupDir,
    BACKUP_HOUR: "2",
    BACKUP_KEEP_DAYS: mode === "that" ? "30" : "3",
    ...(mode === "mau" && { SEED_EMAIL: "quanly@giapha.test", SEED_PASSWORD: randomBytes(9).toString("base64url") }),
  };
  let changed = !existsSync(join(root, m.envFile));
  for (const [k, v] of Object.entries(defaults)) {
    if (env[k] === undefined) {
      env[k] = v;
      changed = true;
    }
  }
  if (changed) writeEnv(m.envFile, env, `Cấu hình server ${m.label}`);
  if (inherited) console.log("  Dùng lại mật khẩu CSDL của bản chạy trước (.env.demo) cho dữ liệu đang có.");
  return env;
}

function currentLink(mode) {
  const r = docker([...composeArgs(mode), "logs", "--no-color", "tunnel"], { capture: true, allowFail: true });
  const all = `${r.stdout ?? ""}${r.stderr ?? ""}`.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
  return all ? all[all.length - 1] : null;
}

async function waitForLink(mode, timeoutSec = 120) {
  for (let i = 0; i < timeoutSec / 3; i++) {
    const link = currentLink(mode);
    if (link) return link;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

function psql(mode, sql) {
  const r = docker([...composeArgs(mode, false), "exec", "-T", "db", "psql", "-U", "coinguon", "-d", "coinguon", "-Atc", sql], {
    capture: true,
    allowFail: true,
  });
  return r.status === 0 ? r.stdout.trim() : null;
}

function backupNow(mode, why) {
  step(`Sao lưu ${why}`);
  const r = docker([...composeArgs(mode, false), "exec", "-T", "backup", "/bin/sh", "/backup.sh", "now"], { allowFail: true });
  if (r.status !== 0) {
    console.error("✗ Sao lưu không được — dừng lại để không mất dữ liệu. Xem lỗi phía trên, hoặc chạy `pnpm chay:nhat-ky`.");
    process.exit(1);
  }
}

function diagnose(mode) {
  console.error("\n──────── Trạng thái các dịch vụ ────────");
  docker([...composeArgs(mode), "ps", "-a"], { allowFail: true });
  console.error("\n──────── Nhật ký gần nhất ────────");
  docker([...composeArgs(mode), "logs", "--no-color", "--tail", "40", "db", "migrate", "media-init", "api", "web"], { allowFail: true });
  console.error(`
Gợi ý:
  • Nhật ký "db" có "password authentication failed" hoặc "role … does not exist": mật khẩu trong ${MODES[mode].envFile}
    không khớp CSDL đã có. Dữ liệu mẫu: chạy lại \`pnpm chay --mau\` (luôn tạo mới). Dữ liệu thật: khôi phục đúng file env cũ.
  • Lỗi tải gói (npm, registry, ETIMEDOUT) khi build: kiểm tra mạng rồi chạy lại.`);
}

/** Server đang chạy là chế độ nào (để link / nhật ký / sao lưu / dừng biết nhắm vào đâu) */
function activeMode() {
  if (isRunning(MODES.that.project)) return "that";
  if (isRunning(MODES.mau.project)) return "mau";
  return null;
}

// ───────── chạy server ─────────

async function start() {
  const mode = flag("--that") ? "that" : flag("--mau") || flag("--demo") ? "mau" : null;
  if (!mode) {
    console.error("Chọn loại dữ liệu:\n  pnpm chay --mau    dữ liệu mẫu (giả), xoá làm lại mỗi lần\n  pnpm chay --that   dữ liệu thật, giữ nguyên");
    process.exit(1);
  }
  const m = MODES[mode];
  const tunnel = !flag("--khong-link");
  console.log(`══════ Gia Phả Cội Nguồn — chạy server ${m.label} ══════`);
  checkDocker();
  fixLineEndings();
  const env = ensureEnv(mode);

  // 1. Dọn server đang chạy (cả hai chế độ dùng chung cổng 3000)
  step("Dọn server cũ");
  if (mode === "that" && isRunning(MODES.that.project)) backupNow("that", "dữ liệu thật trước khi dựng lại server");
  // dữ liệu mẫu luôn bỏ (xoá cả CSDL, ảnh giả); dữ liệu thật chỉ gỡ container, KHÔNG xoá dữ liệu
  const removed = teardown(MODES.mau.project, { volumes: true }) + teardown(MODES.that.project);
  console.log(removed ? `  Đã gỡ ${removed} container cũ.` : "  Không có server cũ.");

  if (mode === "that" && flag("--xoa-du-lieu-cu") && volumeExists("coinguon_pgdata")) {
    step("Xoá dữ liệu cũ theo yêu cầu (--xoa-du-lieu-cu) — sao lưu trước");
    // đợi CSDL sẵn sàng hẳn rồi mới sao lưu (sao lưu lỗi thì dừng, không xoá)
    docker([...composeArgs("that", false), "up", "-d", "--wait", "db"], { allowFail: true });
    docker([...composeArgs("that", false), "up", "-d", "media-init", "backup"], { allowFail: true });
    backupNow("that", "trước khi xoá");
    teardown(MODES.that.project, { volumes: true });
    console.log("  Đã xoá. Bản sao lưu vừa tạo nằm trong thư mục backups/.");
  }

  // 2. Build + chạy
  step("Build và chạy server mới (lần đầu mất 5–10 phút)");
  const up = docker([...composeArgs(mode, tunnel), "up", "-d", "--build", "--remove-orphans"], { allowFail: true });
  if (up.status !== 0) {
    diagnose(mode);
    process.exit(1);
  }

  // 3. Dữ liệu
  if (mode === "mau") {
    step("Tạo dữ liệu mẫu (60 người giả, 6 đời, ảnh minh hoạ)");
    docker([...composeArgs(mode, false), "run", "--rm", "-e", `SEED_EMAIL=${env.SEED_EMAIL}`, "-e", `SEED_PASSWORD=${env.SEED_PASSWORD}`, "api", "node", "dist/seed.js"]);
  }
  const clans = psql(mode, "select coalesce(string_agg(name, ' | '), '') from clans where deleted_at is null");

  // 4. Link chia sẻ
  let link = null;
  if (tunnel) {
    step("Lấy link chia sẻ từ Cloudflare");
    link = await waitForLink(mode);
    if (link && env.PUBLIC_URL !== link) {
      // địa chỉ dùng trong email (link đặt lại mật khẩu) và ảnh xem trước khi gửi link lên Zalo/Facebook
      env.PUBLIC_URL = link;
      writeEnv(m.envFile, env, `Cấu hình server ${m.label}`);
      docker([...composeArgs(mode), "up", "-d", "--wait", "api", "web"], { allowFail: true });
    }
  }

  // 5. Tóm tắt
  const local = `http://localhost:${env.WEB_PORT || 3000}`;
  const lines = [
    `\n✓ Server ${m.label} đang chạy.`,
    tunnel ? `  Link gửi cho người khác: ${link ?? "(chưa lấy được — chạy `pnpm chay:link` sau ít phút)"}` : "  Không mở link chia sẻ (--khong-link).",
    `  Trên máy này:            ${local}`,
  ];
  if (mode === "mau") {
    lines.push(`  Tài khoản quản lý mẫu:   ${env.SEED_EMAIL} / ${env.SEED_PASSWORD}`);
    lines.push("  Dữ liệu mẫu bị xoá và tạo lại mỗi lần chạy `pnpm chay --mau`.");
  } else {
    if (!clans) lines.push("  CSDL trống: mở link → Tạo tài khoản → người đầu tiên là quản lý chính, tạo dòng họ.");
    else lines.push(`  Dòng họ: ${clans}`);
    if (clans && clans.includes("(dữ liệu giả)")) {
      lines.push(
        "",
        "  ⚠ Dữ liệu thật đang chứa DỮ LIỆU GIẢ (do `pnpm demo` bản cũ để lại).",
        "    Muốn bắt đầu sạch: pnpm chay --that --xoa-du-lieu-cu   (sao lưu trước rồi xoá)",
      );
    }
    lines.push(`  Sao lưu tự động lúc ${env.BACKUP_HOUR}:00 hằng ngày vào thư mục backups/ (máy phải đang bật); nên chép ra Google Drive định kỳ.`);
  }
  lines.push("  Dừng: pnpm chay:dung" + (tunnel ? " — link đổi mỗi lần chạy lại." : ""));
  console.log(lines.join("\n"));
}

// ───────── lệnh phụ ─────────

function needActive() {
  const mode = activeMode();
  if (!mode) {
    console.error("Chưa có server nào đang chạy. Chạy: pnpm chay --mau  hoặc  pnpm chay --that");
    process.exit(1);
  }
  return mode;
}

if (cmd === "start") {
  await start();
} else if (cmd === "link") {
  const mode = needActive();
  const link = currentLink(mode);
  console.log(link ? `Link hiện tại (${MODES[mode].label}): ${link}` : "Server đang chạy không mở link chia sẻ (--khong-link) hoặc chưa lấy được link.");
} else if (cmd === "logs") {
  docker([...composeArgs(needActive()), "logs", "-f", "--tail", "100", "api", "web", "tunnel"], { allowFail: true });
} else if (cmd === "backup") {
  const mode = needActive();
  backupNow(mode, MODES[mode].label.toLowerCase());
  console.log(`\nFile sao lưu nằm trong thư mục ${MODES[mode].backupDir.replace("../../", "")}/ của repo.`);
} else if (cmd === "stop") {
  checkDocker();
  for (const mode of ["mau", "that"]) {
    const ids = docker(["ps", "-q", "--filter", `label=com.docker.compose.project=${MODES[mode].project}`], { capture: true, allowFail: true }).stdout.split(/\s+/).filter(Boolean);
    if (ids.length) docker(["stop", ...ids], { capture: true, allowFail: true });
  }
  console.log("\nĐã dừng. Dữ liệu thật vẫn còn; chạy lại bằng `pnpm chay --that` (hoặc `--mau`).");
} else {
  console.error(`Lệnh không rõ: ${cmd}. Dùng: pnpm chay --mau | --that  ·  chay:link · chay:nhat-ky · chay:sao-luu · chay:dung`);
  process.exit(1);
}
