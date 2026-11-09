import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FONT_FILES } from "../src/export/tree-render.js";

// Image Docker đóng gói API bằng `pnpm deploy`, chỉ lấy các thư mục trong "files" của package.json
describe("Đóng gói API", () => {
  it("mang theo phông chữ để xuất PDF/SVG", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { files: string[] };
    expect(pkg.files).toEqual(expect.arrayContaining(["dist", "assets"]));
    for (const f of Object.values(FONT_FILES)) expect(existsSync(new URL(`../assets/fonts/${f}`, import.meta.url))).toBe(true);
  });
});
