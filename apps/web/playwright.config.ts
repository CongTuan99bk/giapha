import { defineConfig, devices } from "@playwright/test";

/**
 * Test giao diện trên trình duyệt thật: API (NestJS) + web (Next standalone) chạy trên database riêng `coinguon_e2e`.
 * Cần build trước: pnpm build. Chạy: pnpm --filter @coinguon/web test:e2e
 */
const E2E_DB = process.env.E2E_DATABASE_NAME ?? "coinguon_e2e";
const host = process.env.E2E_DB_HOST ?? "localhost:5432";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 860 } }, testIgnore: /mobile\.spec\.ts/ },
    // chạy sau desktop: dùng lại tài khoản + dòng họ mà luồng desktop đã tạo
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/, dependencies: ["desktop"] },
  ],
  webServer: [
    {
      command: "node ../api/dist/main.js",
      url: "http://localhost:4000/api/v1/health",
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        NODE_ENV: "test",
        PORT: "4000",
        CLAN_MODE: "single",
        APP_DATABASE_URL: `postgresql://coinguon_app:coinguon_app@${host}/${E2E_DB}`,
        PLATFORM_DATABASE_URL: `postgresql://coinguon_platform:coinguon_platform@${host}/${E2E_DB}`,
      },
    },
    {
      command: "node .next/standalone/apps/web/server.js",
      url: "http://localhost:3000/dang-nhap",
      reuseExistingServer: false,
      timeout: 30_000,
      env: { PORT: "3000", HOSTNAME: "localhost" },
    },
  ],
});
