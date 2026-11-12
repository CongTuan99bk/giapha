// Link cố định qua Tailscale Funnel: https://<tên-máy>.<tên-mạng>.ts.net trỏ vào web trên máy này.
// Tailscale chạy trên máy (không trong Docker); Funnel nhận https, giải mã ngay trên máy rồi chuyển tới http://127.0.0.1:<cổng web>.
// Tailscale ghi đè X-Forwarded-For bằng IP thật của khách (khách không tự gửi giả được) → API đọc header này để giới hạn theo IP.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const KNOWN_PATHS = {
  win32: ["C:\\Program Files\\Tailscale\\tailscale.exe", "C:\\Program Files (x86)\\Tailscale\\tailscale.exe"],
  darwin: ["/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/opt/homebrew/bin/tailscale", "/usr/local/bin/tailscale"],
};

export const INSTALL_HINT = `Cài Tailscale: https://tailscale.com/download (Windows: tải bản cài, macOS: bản tải từ trang Tailscale),
  mở lên và đăng nhập (tài khoản Google/Microsoft đều được), rồi chạy lại lệnh.`;

/** Đường dẫn lệnh tailscale (TAILSCALE_BIN để chỉ định riêng), null nếu chưa cài */
export function findTailscale(env = process.env, platform = process.platform) {
  if (env.TAILSCALE_BIN) return existsSync(env.TAILSCALE_BIN) ? env.TAILSCALE_BIN : null;
  const r = spawnSync("tailscale", ["version"], { encoding: "utf8" });
  if (!r.error && r.status === 0) return "tailscale";
  return (KNOWN_PATHS[platform] ?? []).find((p) => existsSync(p)) ?? null;
}

/**
 * Máy này đã sẵn sàng trên Tailscale chưa → `{ ok: true, host, link }` hoặc `{ ok: false, problem }`.
 * `tailscale status --json` vẫn in JSON khi chưa đăng nhập (mã thoát khác 0) nên đọc JSON trước.
 */
export function tailscaleStatus(bin) {
  const r = spawnSync(bin, ["status", "--json"], { encoding: "utf8" });
  if (r.error) return { ok: false, problem: `Không chạy được lệnh Tailscale (${r.error.message}).\n  ${INSTALL_HINT}` };
  let s;
  try {
    s = JSON.parse(r.stdout);
  } catch {
    const msg = `${r.stderr ?? ""}${r.stdout ?? ""}`.trim();
    return { ok: false, problem: `Tailscale chưa chạy${msg ? ` (${msg.split("\n")[0]})` : ""}. Mở ứng dụng Tailscale trên máy rồi chạy lại lệnh.` };
  }
  switch (s.BackendState) {
    case "Running":
      break;
    case "NeedsLogin":
      return { ok: false, problem: "Tailscale chưa đăng nhập. Mở ứng dụng Tailscale → Log in (hoặc chạy `tailscale up`), rồi chạy lại lệnh." };
    case "NeedsMachineAuth":
      return { ok: false, problem: "Máy này đang chờ duyệt trong mạng Tailscale. Vào https://login.tailscale.com/admin/machines → bấm Approve cho máy này." };
    case "Stopped":
      return { ok: false, problem: "Tailscale đang tắt. Mở ứng dụng Tailscale → bật Connect (hoặc chạy `tailscale up`), rồi chạy lại lệnh." };
    default:
      return { ok: false, problem: `Tailscale chưa sẵn sàng (trạng thái ${s.BackendState ?? "không rõ"}). Đợi vài giây rồi chạy lại lệnh.` };
  }
  const host = String(s.Self?.DNSName ?? "").replace(/\.$/, "");
  if (!host.endsWith(".ts.net")) {
    return {
      ok: false,
      problem: "Mạng Tailscale chưa bật MagicDNS nên chưa có tên …ts.net. Vào https://login.tailscale.com/admin/dns → Enable MagicDNS, rồi chạy lại lệnh.",
    };
  }
  return { ok: true, host, link: `https://${host}` };
}

/** Funnel cổng 443 của máy này đang trỏ tới đâu (null nếu chưa mở) — chỉ tắt Funnel do mình mở */
export function funnelTarget(bin, host) {
  const r = spawnSync(bin, ["funnel", "status", "--json"], { encoding: "utf8" });
  if (r.error || r.status !== 0) return null;
  try {
    const cfg = JSON.parse(r.stdout || "{}");
    if (!cfg.AllowFunnel?.[`${host}:443`]) return null;
    return cfg.Web?.[`${host}:443`]?.Handlers?.["/"]?.Proxy ?? null;
  } catch {
    return null;
  }
}

/** Chạy lệnh, vừa in ra màn hình (người dùng thấy link bật Funnel lần đầu) vừa giữ lại để đọc lỗi */
function runShown(bin, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["inherit", "pipe", "pipe"] });
    let out = "";
    const show = (stream, chunk) => {
      out += chunk;
      stream.write(chunk);
    };
    child.stdout.on("data", (c) => show(process.stdout, c));
    child.stderr.on("data", (c) => show(process.stderr, c));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ status: 1, out: e.message });
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status: status ?? 1, out });
    });
  });
}

/**
 * Mở Funnel: https://<host> → http://127.0.0.1:<port>, chạy nền (vẫn mở khi đóng cửa sổ, tự mở lại khi khởi động máy).
 * Lần đầu Tailscale in một link để bật Funnel cho mạng và chờ — mở link, bấm bật, lệnh tự chạy tiếp (chờ tối đa 10 phút).
 * → `{ ok: true }` hoặc `{ ok: false, problem }`.
 */
export async function startFunnel(bin, host, port, { timeoutMs = 10 * 60_000 } = {}) {
  const target = `http://127.0.0.1:${port}`;
  const r = await runShown(bin, ["funnel", "--bg", target], timeoutMs);
  if (r.status !== 0) {
    if (/access denied|permission|operator/i.test(r.out)) {
      return {
        ok: false,
        problem:
          process.platform === "win32"
            ? 'Tailscale từ chối quyền mở Funnel. Chạy lại lệnh trong cửa sổ PowerShell mở bằng "Run as administrator".'
            : "Tailscale từ chối quyền mở Funnel. Chạy một lần: sudo tailscale set --operator=$USER  rồi chạy lại lệnh.",
      };
    }
    if (/not available|not enabled|node attribute|not allowed for funnel/i.test(r.out)) {
      return {
        ok: false,
        problem:
          "Mạng Tailscale chưa cho phép Funnel. Mở link Tailscale vừa in phía trên (hoặc https://login.tailscale.com/admin/acls) để bật, rồi chạy lại lệnh.",
      };
    }
    return { ok: false, problem: "Không mở được Funnel — xem thông báo của Tailscale phía trên, sửa rồi chạy lại lệnh." };
  }
  const now = funnelTarget(bin, host);
  if (now !== target) {
    // lần đầu, có khi Tailscale chỉ in link bật tính năng rồi thoát (không chờ)
    return {
      ok: false,
      problem: `Funnel chưa mở (đang là ${now ?? "tắt"}). Nếu Tailscale vừa in một link ở trên: mở link, bấm bật, rồi chạy lại lệnh. Kiểm tra: tailscale funnel status`,
    };
  }
  return { ok: true };
}

/** Tắt Funnel nếu đang trỏ vào web của mình (không đụng cấu hình Funnel khác người dùng tự đặt) → true nếu đã tắt */
export function stopFunnel(bin, host, port) {
  if (funnelTarget(bin, host) !== `http://127.0.0.1:${port}`) return false;
  return spawnSync(bin, ["funnel", "--https=443", "off"], { encoding: "utf8" }).status === 0;
}
