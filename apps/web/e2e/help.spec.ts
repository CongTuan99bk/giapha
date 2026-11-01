import { expect, test } from "@playwright/test";

test("trang trợ giúp hiển thị hướng dẫn và mục lục, không lộ ghi chú nội bộ", async ({ page }) => {
  await page.goto("/tro-giup");
  await expect(page.getByRole("heading", { level: 1, name: /Hướng dẫn sử dụng/ })).toBeVisible();
  const toc = page.getByRole("navigation", { name: "Mục lục" });
  expect(await toc.getByRole("link").count()).toBeGreaterThan(5);
  await expect(page.getByText("Ghi chú cho người phát triển")).toHaveCount(0);
  await expect(page.getByText(/^title:/)).toHaveCount(0);
});

test("PWA: có manifest và service worker", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({ name: "Gia Phả Cội Nguồn", display: "standalone", lang: "vi" });
  const sw = await request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-cache");
});
