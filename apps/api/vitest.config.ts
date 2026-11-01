import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// NestJS cần metadata của decorator để tiêm phụ thuộc → biên dịch test bằng SWC
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    // test e2e dùng chung một database: chạy tuần tự
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
