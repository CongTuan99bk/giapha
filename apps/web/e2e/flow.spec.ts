import { expect, test, type Page } from "@playwright/test";
import { node, OWNER } from "./data";

test.describe.configure({ mode: "serial" });

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});
test.afterAll(async () => {
  await page.close();
});

const panel = () => page.getByRole("complementary", { name: "Thông tin người được chọn" });

test("người đầu tiên đăng ký và tạo dòng họ", async () => {
  await page.goto("/dang-ky");
  await page.getByLabel("Họ và tên").fill(OWNER.name);
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Mật khẩu").fill(OWNER.password);
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();

  await expect(page).toHaveURL(/\/bat-dau$/);
  await page.getByLabel("Tên dòng họ").fill("Họ Lê Văn – thôn Thử");
  await expect(page.getByLabel("Địa chỉ trang dòng họ")).toHaveValue("ho-le-van-thon-thu");
  await page.getByLabel("Họ", { exact: true }).fill("Lê");
  await page.getByRole("button", { name: "Tạo dòng họ" }).click();

  await expect(page.getByRole("heading", { name: "Bắt đầu từ thuỷ tổ" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Họ Lê Văn – thôn Thử" })).toBeVisible();
});

test("nhập thuỷ tổ, ngày giỗ tự tính", async () => {
  await page.getByLabel("Họ và tên").fill("Lê Văn Cả");
  await page.getByText("Đã mất", { exact: true }).click();
  await page.getByLabel("Ngày mất — ngày").fill("10");
  await page.getByLabel("Ngày mất — tháng").fill("2");
  await page.getByLabel("Ngày mất — năm").fill("2024");
  await page.getByRole("button", { name: "Thêm vào phả đồ" }).click();

  const root = page.locator(node("Lê Văn Cả"));
  await expect(root).toBeVisible();
  await expect(root).toHaveAttribute("aria-label", /đời 1.*thuỷ tổ/);
  await root.click();
  await expect(panel().getByRole("heading", { name: "Lê Văn Cả" })).toBeVisible();
  // 10/2/2024 là mùng 1 Tết Giáp Thìn
  await expect(panel().getByText("mùng 1 tháng Giêng (âm lịch)")).toBeVisible();
});

test("thêm vợ rồi thêm con với vợ", async () => {
  await panel().getByRole("button", { name: "Thêm vợ" }).click();
  await expect(panel().getByText("Vợ của Lê Văn Cả")).toBeVisible();
  await panel().getByLabel("Họ và tên").fill("Trần Thị Hai");
  await panel().getByRole("button", { name: "Thêm vợ/chồng" }).click();

  await expect(panel().getByRole("heading", { name: "Trần Thị Hai" })).toBeVisible();
  await expect(page.locator(node("Trần Thị Hai"))).toHaveAttribute("aria-label", /dâu hoặc rể/);

  await panel().getByRole("button", { name: /Lê Văn Cả/ }).click();
  await panel().getByRole("button", { name: "Thêm con với Hai" }).click();
  await panel().getByLabel("Họ và tên").fill("Lê Văn Con");
  await panel().getByLabel("Ngày sinh — năm").fill("1980");
  await panel().getByRole("button", { name: "Thêm con", exact: true }).click();

  await expect(panel().getByRole("heading", { name: "Lê Văn Con" })).toBeVisible();
  await expect(page.locator(node("Lê Văn Con"))).toHaveAttribute("aria-label", /đời 2, sinh 1980/);
});

test("sửa thông tin", async () => {
  await panel().getByRole("button", { name: "Sửa thông tin" }).click();
  await panel().getByLabel("Họ và tên").fill("Lê Văn Con Trưởng");
  await panel().getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(panel().getByRole("heading", { name: "Lê Văn Con Trưởng" })).toBeVisible();
  await expect(page.locator(node("Lê Văn Con Trưởng"))).toBeVisible();
});

test("tra xưng hô (mặc định miền Trung)", async () => {
  await page.getByRole("link", { name: "Xưng hô" }).click();
  const [first, second] = [page.getByRole("combobox").nth(0), page.getByRole("combobox").nth(0)];
  await first.fill("con truong");
  await page.getByRole("option", { name: /Lê Văn Con Trưởng/ }).click();
  await second.fill("le van ca");
  await page.getByRole("option", { name: /Lê Văn Cả/ }).click();
  await expect(page.getByText("Lê Văn Con Trưởng gọi Lê Văn Cả là")).toBeVisible();
  await expect(page.getByText("Ba", { exact: true })).toBeVisible();
  await expect(page.getByText("Con", { exact: true })).toBeVisible();
});

test("danh sách: tìm tên không dấu", async () => {
  await page.getByRole("link", { name: "Danh sách" }).click();
  await expect(page.getByText("3 người")).toBeVisible();
  await page.getByPlaceholder(/Tìm theo tên/).fill("tran thi");
  await expect(page.getByRole("link", { name: /Trần Thị Hai/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Lê Văn Cả/ })).toHaveCount(0);
  await page.getByRole("link", { name: /Trần Thị Hai/ }).click();
  await expect(panel().getByRole("heading", { name: "Trần Thị Hai" })).toBeVisible();
});

test("người đăng ký sau chưa vào được dòng họ (chế độ một dòng họ)", async () => {
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/dang-nhap/);
  await page.goto("/dang-ky");
  await page.getByLabel("Họ và tên").fill("Người Mới");
  await page.getByLabel("Email").fill("nguoimoi@e2e.test");
  await page.getByLabel("Mật khẩu").fill("matkhau-e2e-456");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByText(/Bạn chưa là thành viên của Họ Lê Văn – thôn Thử/)).toBeVisible();
});

test("đăng nhập sai mật khẩu báo lỗi rõ ràng", async ({ browser }) => {
  const p = await browser.newPage();
  await p.goto("/dang-nhap");
  await p.getByLabel("Email").fill(OWNER.email);
  await p.getByLabel("Mật khẩu").fill("sai-mat-khau");
  await p.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(p.getByRole("alert").filter({ hasText: "Email" })).toHaveText("Email hoặc mật khẩu chưa đúng.");
  await p.close();
});
