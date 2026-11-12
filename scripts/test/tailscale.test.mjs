// node --test scripts/test — kiểm tra phần link cố định qua Tailscale với lệnh tailscale giả
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { findTailscale, funnelTarget, startFunnel, stopFunnel, tailscaleStatus } from "../tailscale.mjs";

const bin = join(dirname(fileURLToPath(import.meta.url)), "fake-tailscale.mjs");
const dir = mkdtempSync(join(tmpdir(), "fake-ts-"));
process.env.FAKE_TS_DIR = dir;
const HOST = "giapha.yak-bebop.ts.net";
const setState = (s) => writeFileSync(join(dir, "state.json"), JSON.stringify({ backend: "Running", dnsName: `${HOST}.`, funnel: "ok", ...s }));
beforeEach(() => {
  rmSync(join(dir, "funnel.json"), { force: true });
  setState({});
});
after(() => rmSync(dir, { recursive: true, force: true }));

test("tìm lệnh tailscale theo TAILSCALE_BIN; đường dẫn sai coi như chưa cài", () => {
  assert.equal(findTailscale({ TAILSCALE_BIN: bin }), bin);
  assert.equal(findTailscale({ TAILSCALE_BIN: join(dir, "khong-co") }), null);
});

test("đang chạy: link là https://<tên máy>.ts.net (bỏ dấu chấm cuối)", () => {
  assert.deepEqual(tailscaleStatus(bin), { ok: true, host: HOST, link: `https://${HOST}` });
});

test("chưa đăng nhập / đang tắt / chưa bật MagicDNS → báo cách sửa", () => {
  setState({ backend: "NeedsLogin" });
  assert.match(tailscaleStatus(bin).problem, /chưa đăng nhập/);
  setState({ backend: "Stopped" });
  assert.match(tailscaleStatus(bin).problem, /đang tắt/);
  setState({ dnsName: "" });
  assert.match(tailscaleStatus(bin).problem, /MagicDNS/);
});

test("mở Funnel trỏ vào web trên máy, rồi đóng lại", async () => {
  assert.deepEqual(await startFunnel(bin, HOST, "3000"), { ok: true });
  assert.equal(funnelTarget(bin, HOST), "http://127.0.0.1:3000");
  // không đóng Funnel người dùng tự đặt cho cổng khác
  assert.equal(stopFunnel(bin, HOST, "8080"), false);
  assert.equal(stopFunnel(bin, HOST, "3000"), true);
  assert.equal(funnelTarget(bin, HOST), null);
  assert.equal(existsSync(join(dir, "funnel.json")), false);
});

test("thiếu quyền / mạng chưa cho phép Funnel / mới in link bật tính năng → báo đúng cách sửa", async () => {
  setState({ funnel: "denied" });
  assert.match((await startFunnel(bin, HOST, "3000")).problem, /từ chối quyền/);
  setState({ funnel: "noattr" });
  assert.match((await startFunnel(bin, HOST, "3000")).problem, /chưa cho phép Funnel/);
  setState({ funnel: "printlink" });
  assert.match((await startFunnel(bin, HOST, "3000")).problem, /mở link, bấm bật, rồi chạy lại lệnh/);
});
