#!/usr/bin/env node
// Lệnh `tailscale` giả cho test: trạng thái đọc từ $FAKE_TS_DIR/state.json, cấu hình Funnel ghi vào $FAKE_TS_DIR/funnel.json
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.FAKE_TS_DIR;
const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
const cfgFile = join(dir, "funnel.json");
const args = process.argv.slice(2);
const host = state.dnsName.replace(/\.$/, "");

if (args[0] === "version") {
  console.log("1.90.0");
} else if (args[0] === "status" && args[1] === "--json") {
  console.log(JSON.stringify({ BackendState: state.backend, Self: { DNSName: state.dnsName } }));
  process.exit(state.backend === "Running" ? 0 : 1);
} else if (args[0] === "funnel" && args[1] === "status") {
  console.log(existsSync(cfgFile) ? readFileSync(cfgFile, "utf8") : "{}");
} else if (args[0] === "funnel" && args[1] === "--https=443" && args[2] === "off") {
  rmSync(cfgFile, { force: true });
} else if (args[0] === "funnel" && args[1] === "--bg") {
  if (state.funnel === "denied") {
    console.error("Access denied: serve config denied\n\nUse 'sudo tailscale funnel --bg 3000' or 'tailscale set --operator=$USER'");
    process.exit(1);
  }
  if (state.funnel === "noattr") {
    console.error('Funnel not available; "funnel" node attribute not set. See https://tailscale.com/s/no-funnel.');
    process.exit(1);
  }
  if (state.funnel === "printlink") {
    console.log("\nFunnel is not enabled on your tailnet.\nTo enable, visit:\n\n         https://login.tailscale.com/f/funnel?node=abc\n");
    process.exit(0);
  }
  const cfg = { TCP: { 443: { HTTPS: true } }, Web: { [`${host}:443`]: { Handlers: { "/": { Proxy: args[2] } } } }, AllowFunnel: { [`${host}:443`]: true } };
  writeFileSync(cfgFile, JSON.stringify(cfg));
  console.log(`Available on the internet:\n\nhttps://${host}/\n|-- proxy ${args[2]}\n\nFunnel started and running in the background.`);
} else {
  console.error(`fake tailscale: không hiểu ${args.join(" ")}`);
  process.exit(2);
}
