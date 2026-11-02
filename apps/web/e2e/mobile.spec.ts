import { expect, test } from "@playwright/test";
import { node, OWNER } from "./data";

test("điện thoại: đăng nhập, xem phả đồ, chạm vào người mở bảng thông tin", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dang-nhap/);
  await page.getByLabel("Số điện thoại hoặc email").fill(OWNER.email);
  await page.getByLabel("Mật khẩu").fill(OWNER.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page.getByRole("region", { name: "Ảnh dòng họ" })).toBeVisible();
  await page.getByRole("link", { name: "Xem phả đồ" }).tap();
  const root = page.locator(node("Lê Văn Cả"));
  await expect(root).toBeVisible();
  await root.tap();
  const sheet = page.getByRole("complementary", { name: "Thông tin người được chọn" });
  await expect(sheet.getByRole("heading", { name: "Lê Văn Cả" })).toBeVisible();
  // bảng nằm nửa dưới, người được chọn vẫn nhìn thấy phía trên
  const box = await sheet.boundingBox();
  const nodeBox = await root.boundingBox();
  expect(nodeBox!.y + nodeBox!.height).toBeLessThanOrEqual(box!.y + 1);
  await sheet.getByRole("button", { name: "Đóng bảng thông tin" }).click();
  await expect(sheet).toHaveCount(0);
});
