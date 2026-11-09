import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { node, OWNER } from "./data";

test.describe.configure({ mode: "serial" });

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});
test.afterAll(async () => {
  await page.close();
});

const fixture = (name: string) => join(dirname(fileURLToPath(import.meta.url)), "fixtures", name);
const panel = () => page.getByRole("complementary", { name: "Thông tin người được chọn" });

test("người đầu tiên đăng ký và tạo dòng họ", async () => {
  await page.goto("/dang-ky");
  await page.getByLabel("Họ và tên").fill(OWNER.name);
  await page.getByLabel("Email (không bắt buộc)").fill(OWNER.email);
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

  await panel()
    .getByRole("button", { name: /Lê Văn Cả/ })
    .click();
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

test("ảnh chân dung: tải lên từ bảng thông tin, hiện trên ô phả đồ", async () => {
  await page.getByRole("link", { name: "Phả đồ", exact: true }).click();
  await page.locator(node("Lê Văn Cả")).click();
  await panel().getByText("Thêm ảnh chân dung").locator("input[type=file]").setInputFiles(fixture("chan-dung.jpg"));
  await expect(panel().getByRole("img", { name: "Ảnh chân dung Lê Văn Cả" })).toBeVisible();
  await expect(page.locator(`${node("Lê Văn Cả")} image`)).toHaveCount(1);

  // bấm ảnh → khung xem ảnh lớn; Esc để đóng
  await panel().getByRole("button", { name: "Xem ảnh lớn: Lê Văn Cả" }).click();
  const viewer = page.getByRole("dialog", { name: "Lê Văn Cả" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("img", { name: "Ảnh chân dung Lê Văn Cả" })).toBeVisible();
  await expect(viewer.getByText("Đang tải ảnh…")).toBeHidden(); // ảnh đã có trong cache vẫn phải hiện ra
  await viewer.getByRole("button", { name: "Phóng to" }).click();
  await expect(viewer.getByRole("img")).toHaveAttribute("src", /\/orig$/);
  await page.keyboard.press("Escape"); // lần 1: thu về vừa màn hình
  await expect(viewer.getByRole("button", { name: "Phóng to" })).toBeVisible();
  await page.keyboard.press("Escape"); // lần 2: đóng
  await expect(viewer).toBeHidden();
});

test("trang chủ: nhiều ảnh banner tự trượt + câu đối", async () => {
  await page.getByRole("link", { name: "Cài đặt" }).click();
  await page.locator("#trang-chu input[type=file]").setInputFiles([fixture("banner-1.jpg"), fixture("banner-2.jpg")]);
  await expect(page.getByLabel("Chú thích ảnh 2")).toBeVisible();
  await page.getByLabel("Chú thích ảnh 1").fill("Nhà thờ họ");
  await page.getByLabel("Vế bên trái").fill("Cây có cội mới nảy cành xanh lá");
  await page.getByLabel("Vế bên phải").fill("Nước có nguồn mới bể rộng sông sâu");
  await page.getByLabel("Khẩu hiệu dưới tên dòng họ").fill("Uống nước nhớ nguồn");
  await page.getByRole("button", { name: "Lưu trang chủ" }).click();
  await expect(page.getByText("Đã lưu. Xem ở thẻ Trang chủ.")).toBeVisible();

  await page.getByRole("link", { name: "Trang chủ" }).click();
  const carousel = page.getByRole("region", { name: "Ảnh dòng họ" });
  await expect(carousel).toBeVisible();
  await expect(page.getByText("Uống nước nhớ nguồn")).toBeVisible();
  await expect(page.getByRole("note", { name: /Câu đối vế trái: Cây có cội/ })).toBeVisible();
  await expect(carousel.getByRole("button", { name: "Xem ảnh 1" })).toHaveAttribute("aria-current", "true");
  await carousel.hover();
  await carousel.getByRole("button", { name: "Ảnh sau" }).click();
  await expect(carousel.getByRole("button", { name: "Xem ảnh 2" })).toHaveAttribute("aria-current", "true");
  // ảnh cuối → bấm tiếp quay vòng về ảnh đầu
  await page.waitForTimeout(800);
  await carousel.getByRole("button", { name: "Ảnh sau" }).click();
  await expect(carousel.getByRole("button", { name: "Xem ảnh 1" })).toHaveAttribute("aria-current", "true");

  // bấm vào ảnh banner → xem ảnh lớn, chuyển ảnh bằng phím mũi tên, quay vòng
  await page.waitForTimeout(800);
  await carousel.getByRole("button", { name: "Xem ảnh lớn: Nhà thờ họ" }).click();
  const viewer = page.getByRole("dialog");
  await expect(viewer.getByText("1/2")).toBeVisible();
  await expect(viewer.getByText("Đang tải ảnh…")).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByText("2/2")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByText("1/2")).toBeVisible();
  await expect(viewer.getByRole("link", { name: "Tải ảnh gốc" })).toHaveAttribute("href", /\/orig$/);
  await viewer.getByRole("button", { name: "Đóng xem ảnh" }).click();
  await expect(viewer).toBeHidden();
});

let inviteUrl = "";

test("tạo link mời trong Cài đặt", async () => {
  await page.getByRole("link", { name: "Cài đặt" }).click();
  await expect(page.getByRole("heading", { name: "Cài đặt dòng họ" })).toBeVisible();
  await page.getByText("Gửi link mời", { exact: true }).click();
  await page.getByLabel("Số người dùng được link").selectOption("10");
  await page.getByRole("button", { name: "Tạo link mời" }).click();
  const link = page.getByRole("textbox", { name: "Link mời" });
  await expect(link).toHaveValue(/\/moi\/[A-Za-z0-9_-]{24}$/);
  inviteUrl = new URL(await link.inputValue()).pathname;
  await expect(page.getByText(/đã dùng 0\/10/)).toBeVisible();
});

test("quản trị tự mở link mời của mình: thấy rõ đang dùng tài khoản nào, vai trò không đổi", async () => {
  await page.goto(inviteUrl);
  await expect(page.getByText(/tài khoản này đã là chủ sở hữu của dòng họ/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Tham gia dòng họ" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Đăng xuất để dùng tài khoản khác" })).toBeVisible();
  await page.getByRole("link", { name: "Vào dòng họ" }).click();
  await expect(page.getByText(`${OWNER.name} · Chủ sở hữu`)).toBeVisible();
});

test("người tự đăng ký sau chưa vào được dòng họ, phải chờ duyệt (chế độ một dòng họ)", async () => {
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/dang-nhap/);
  await page.goto("/dang-ky");
  await expect(page.getByText(/Ban quản lý Họ Lê Văn – thôn Thử sẽ duyệt tài khoản/)).toBeVisible();
  await page.getByLabel("Họ và tên").fill("Người Mới");
  await page.getByLabel("Email (không bắt buộc)").fill("nguoimoi@e2e.test");
  await page.getByLabel("Mật khẩu").fill("matkhau-e2e-456");
  await page.getByRole("button", { name: "Tạo tài khoản và gửi yêu cầu" }).click();
  await expect(page.getByRole("heading", { name: "Đang chờ duyệt" })).toBeVisible();
});

test("người đã có tài khoản mở link mời → tham gia với vai trò thành viên (chỉ xem)", async () => {
  await page.goto(inviteUrl);
  await expect(page.getByRole("main").getByText("Họ Lê Văn – thôn Thử")).toBeVisible();
  await expect(page.getByText(/Bạn đang đăng nhập là Người Mới \(nguoimoi@e2e.test\)/)).toBeVisible();
  await page.getByRole("button", { name: "Tham gia dòng họ" }).click();
  // vào trang chủ dòng họ (có banner), rồi mở phả đồ
  await expect(page.getByRole("heading", { level: 1, name: "Họ Lê Văn – thôn Thử" })).toBeVisible();
  await page.getByRole("link", { name: "Phả đồ", exact: true }).click();

  const root = page.locator(node("Lê Văn Cả"));
  await expect(root).toBeVisible();
  await expect(page.getByRole("link", { name: "Cài đặt" })).toHaveCount(0);
  await root.click();
  await expect(panel().getByRole("heading", { name: "Lê Văn Cả" })).toBeVisible();
  await expect(panel().getByRole("button", { name: "Sửa thông tin" })).toHaveCount(0);
  await panel().getByRole("button", { name: "Đây là tôi" }).click();
  await expect(panel().getByText("Đây là bạn.")).toBeVisible();
});

test("người chưa có tài khoản: mở link → tạo tài khoản → quay lại tham gia", async ({ browser }) => {
  const p = await browser.newPage();
  await p.goto(inviteUrl);
  await p.getByRole("link", { name: "Tạo tài khoản để tham gia" }).click();
  await p.getByLabel("Họ và tên").fill("Lê Thị Cháu");
  await p.getByLabel("Email (không bắt buộc)").fill("chau@e2e.test");
  await p.getByLabel("Mật khẩu").fill("matkhau-e2e-789");
  await p.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(p).toHaveURL(new RegExp(inviteUrl + "$"));
  await p.getByRole("button", { name: "Tham gia dòng họ" }).click();
  await p.getByRole("link", { name: "Xem phả đồ" }).click();
  await expect(p.locator(node("Lê Văn Cả"))).toBeVisible();
  await p.close();
});

test("chủ sở hữu thấy thành viên mới và nâng vai trò", async ({ browser }) => {
  const p = await browser.newPage();
  await p.goto("/dang-nhap");
  await p.getByLabel("Số điện thoại hoặc email").fill(OWNER.email);
  await p.getByLabel("Mật khẩu").fill(OWNER.password);
  await p.getByRole("button", { name: "Đăng nhập" }).click();
  await p.getByRole("link", { name: "Cài đặt" }).click();
  await expect(p.getByText("nguoimoi@e2e.test")).toBeVisible();
  await expect(p.getByText("Trong phả: Lê Văn Cả")).toBeVisible();
  const role = p.getByLabel("Vai trò của Lê Thị Cháu");
  await expect(role).toHaveValue("member");
  await role.selectOption("editor");
  await expect(role).toHaveValue("editor");
  await p.reload();
  await expect(p.getByLabel("Vai trò của Lê Thị Cháu")).toHaveValue("editor");
  await p.getByText("Gửi link mời", { exact: true }).click();
  await expect(p.getByText(/đã dùng 2\/10/)).toBeVisible();

  // quản trị tạo link đặt lại mật khẩu hộ (gửi qua Zalo), người nhận đặt mật khẩu mới
  await p.getByRole("listitem").filter({ hasText: "chau@e2e.test" }).getByRole("button", { name: "Tạo link đặt lại mật khẩu" }).click();
  const resetUrl = await p.getByLabel("Link đặt lại mật khẩu của Lê Thị Cháu").inputValue();
  const q = await browser.newPage();
  await q.goto(new URL(resetUrl).pathname + new URL(resetUrl).search);
  await q.getByLabel("Mật khẩu mới", { exact: true }).fill("cháu-đổi-mật-khẩu");
  await q.getByLabel("Nhập lại mật khẩu mới").fill("cháu-đổi-mật-khẩu");
  await q.getByRole("button", { name: "Đặt mật khẩu mới" }).click();
  await expect(q.getByText("Đã đặt mật khẩu mới.")).toBeVisible();
  await q.getByLabel("Số điện thoại hoặc email").fill("chau@e2e.test");
  await q.getByLabel("Mật khẩu").fill("cháu-đổi-mật-khẩu");
  await q.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(q.getByRole("heading", { level: 1, name: "Họ Lê Văn – thôn Thử" })).toBeVisible();
  await q.close();
  await p.close();
});

test("quên mật khẩu: trang gửi yêu cầu không tiết lộ email có tài khoản hay không", async ({ browser }) => {
  const p = await browser.newPage();
  await p.goto("/dang-nhap");
  await p.getByRole("link", { name: "Quên mật khẩu?" }).click();
  // chờ trang mới hiện hẳn — nếu không, máy chậm sẽ điền vào ô Email của trang đăng nhập cũ
  await expect(p.getByRole("heading", { name: "Quên mật khẩu" })).toBeVisible();
  await p.getByLabel("Email").fill("khong-co-ai@e2e.test");
  await p.getByRole("button", { name: "Gửi link đặt lại mật khẩu" }).click();
  await expect(p.getByText(/Nếu khong-co-ai@e2e.test có tài khoản/)).toBeVisible();
  await p.goto("/dat-lai-mat-khau?ma=ma-sai-khong-ton-tai-0123456789");
  await p.getByLabel("Mật khẩu mới", { exact: true }).fill("mat-khau-bat-ky");
  await p.getByLabel("Nhập lại mật khẩu mới").fill("mat-khau-bat-ky");
  await p.getByRole("button", { name: "Đặt mật khẩu mới" }).click();
  await expect(p.getByText(/đã hết hạn hoặc đã được dùng/)).toBeVisible();
  await expect(p.getByRole("link", { name: "Yêu cầu link mới" })).toBeVisible();
  await p.close();
});

test("đăng nhập sai mật khẩu báo lỗi rõ ràng", async ({ browser }) => {
  const p = await browser.newPage();
  await p.goto("/dang-nhap");
  await p.getByLabel("Số điện thoại hoặc email").fill(OWNER.email);
  await p.getByLabel("Mật khẩu").fill("sai-mat-khau");
  await p.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(p.getByRole("alert").filter({ hasText: "mật khẩu" })).toHaveText("Số điện thoại/email hoặc mật khẩu chưa đúng.");
  await p.close();
});

async function loginOwner(p: Page) {
  await p.goto("/dang-nhap");
  await p.getByLabel("Số điện thoại hoặc email").fill(OWNER.email);
  await p.getByLabel("Mật khẩu").fill(OWNER.password);
  await p.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(p.getByRole("heading", { level: 1, name: "Họ Lê Văn – thôn Thử" })).toBeVisible();
}

test("tự đăng ký bằng số điện thoại → quản trị duyệt → vào được với vai trò đã chọn", async ({ browser }) => {
  const p = await browser.newPage();
  await p.goto("/dang-ky");
  await p.getByLabel("Họ và tên").fill("Lê Văn Số");
  await p.getByLabel("Số điện thoại").fill("0912 000 111");
  await p.getByLabel("Mật khẩu").fill("matkhau-so-111");
  await p.getByLabel("Bạn là ai trong họ?").fill("Cháu nội cụ Cả");
  await p.getByRole("button", { name: "Tạo tài khoản và gửi yêu cầu" }).click();
  await expect(p.getByRole("heading", { name: "Đang chờ duyệt" })).toBeVisible();
  await expect(p.getByText("Lời nhắn của bạn: Cháu nội cụ Cả")).toBeVisible();

  const o = await browser.newPage();
  await loginOwner(o);
  await expect(o.getByRole("link", { name: /Cài đặt\s*, có 1 yêu cầu tham gia chờ duyệt/ })).toBeVisible();
  await o.getByRole("link", { name: /Cài đặt/ }).click();
  await expect(o.getByRole("heading", { name: "Yêu cầu tham gia (1)" })).toBeVisible();
  await expect(o.getByText("0912 000 111", { exact: false })).toBeVisible();
  await o.getByLabel("Vai trò cho Lê Văn Số").selectOption("editor");
  await o.getByRole("button", { name: "Duyệt Lê Văn Số" }).click();
  await expect(o.getByRole("heading", { name: /Yêu cầu tham gia/ })).toHaveCount(0);
  await expect(o.getByLabel("Vai trò của Lê Văn Số")).toHaveValue("editor");

  await p.reload();
  await expect(p.getByRole("heading", { level: 1, name: "Họ Lê Văn – thôn Thử" })).toBeVisible();
  await expect(p.getByText("Lê Văn Số · Người nhập liệu")).toBeVisible();
  await p.close();
  await o.close();
});

test("quản trị tạo tài khoản bằng số điện thoại; người nhận đặt mật khẩu (có nút hiện mật khẩu) rồi đăng nhập", async ({ browser }) => {
  const o = await browser.newPage();
  await loginOwner(o);
  await o.getByRole("link", { name: "Cài đặt" }).click();
  await o.getByLabel("Họ và tên").fill("Lê Văn Cụ");
  await o.getByLabel("Số điện thoại").fill("0905 222 333");
  await o.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  const message = await o.getByLabel("Tin nhắn gửi kèm link đặt mật khẩu").inputValue();
  expect(message).toContain("đăng nhập bằng 0905 222 333");
  const url = new URL(/https?:\/\/\S+/.exec(message)![0]);
  await expect(o.getByRole("listitem").filter({ hasText: "Lê Văn Cụ" }).getByText("Chưa đặt mật khẩu lần đầu")).toBeVisible();

  const q = await browser.newPage();
  await q.goto(url.pathname + url.search);
  const pw = q.getByLabel("Mật khẩu mới", { exact: true });
  await pw.fill("mat-khau-cua-cu");
  await expect(pw).toHaveAttribute("type", "password");
  await q.getByRole("button", { name: "Hiện mật khẩu" }).first().click();
  await expect(pw).toHaveAttribute("type", "text");
  await expect(q.getByRole("button", { name: "Ẩn mật khẩu" }).first()).toHaveAttribute("aria-pressed", "true");
  await q.getByLabel("Nhập lại mật khẩu mới").fill("mat-khau-cua-cu");
  await q.getByRole("button", { name: "Đặt mật khẩu mới" }).click();
  await expect(q.getByText("Đã đặt mật khẩu mới.")).toBeVisible();
  await q.getByLabel("Số điện thoại hoặc email").fill("0905222333");
  await q.getByLabel("Mật khẩu").fill("mat-khau-cua-cu");
  await q.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(q.getByRole("heading", { level: 1, name: "Họ Lê Văn – thôn Thử" })).toBeVisible();
  await expect(q.getByText("Lê Văn Cụ · Thành viên")).toBeVisible();
  await q.close();
  await o.close();
});

test("lịch giỗ: ngày giỗ thuỷ tổ tự tính từ ngày mất, tải được file lịch", async ({ browser }) => {
  const p = await browser.newPage();
  await loginOwner(p);
  await p.getByRole("link", { name: "Lịch giỗ" }).click();
  await expect(p.getByRole("heading", { level: 1, name: "Lịch giỗ" })).toBeVisible();
  const row = p.getByRole("listitem").filter({ hasText: "Lê Văn Cả" });
  // mất 10/2/2024 (dương) = mùng 1 Tết → giỗ mùng 1 tháng Giêng hằng năm
  await expect(row.getByText("mùng 1 tháng Giêng", { exact: false }).first()).toBeVisible();
  await expect(row.getByText(/Còn \d+ ngày|Hôm nay|Ngày mai|Ngày kia/)).toBeVisible();
  const download = p.waitForEvent("download");
  await p.getByRole("link", { name: "Thêm vào lịch điện thoại" }).click();
  expect((await download).suggestedFilename()).toBe("lich-gio-ho-le-van-thon-thu.ics");
  await p.close();
});

test("nhập phả đầy đủ: tên huý, nơi an táng, tiểu sử, con nuôi, xếp thứ tự con, đổi con nuôi thành con ruột", async ({ browser }) => {
  const p = await browser.newPage();
  await loginOwner(p);
  await p.getByRole("link", { name: "Phả đồ", exact: true }).click();
  const pnl = () => p.getByRole("complementary", { name: "Thông tin người được chọn" });
  await p.locator(node("Lê Văn Cả")).click();

  await pnl().getByRole("button", { name: "Sửa thông tin" }).click();
  await pnl().getByText("Thông tin thêm: tên huý").click();
  await pnl().getByLabel("Tên huý").fill("Lê Công Cả");
  await pnl().getByLabel("Quê quán, nơi sinh").fill("Thôn Thử");
  await pnl().getByLabel("Nơi an táng (mộ phần)").fill("Đồi Thông");
  await pnl().getByLabel("Tiểu sử").fill("Người lập làng.\nCó công dựng đình.");
  await pnl().getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(pnl().getByText("Lê Công Cả")).toBeVisible();
  await expect(pnl().getByText("Đồi Thông")).toBeVisible();
  await expect(pnl().getByText(/Người lập làng\./)).toBeVisible();

  // thêm con nuôi với vợ Hai
  await pnl().getByRole("button", { name: "Thêm con với Hai" }).click();
  await pnl().getByText("Con nuôi", { exact: true }).click();
  await pnl().getByLabel("Họ và tên").fill("Lê Văn Nuôi");
  await pnl().getByRole("button", { name: "Thêm con", exact: true }).click();
  await expect(pnl().getByRole("heading", { name: "Lê Văn Nuôi" })).toBeVisible();
  await expect(pnl().getByText("Con thứ 2, trong 2 người con (con nuôi)")).toBeVisible();
  await expect(pnl().getByRole("heading", { name: "Cha mẹ nuôi" })).toBeVisible();

  // xếp lại thứ tự: con nuôi lên trước
  await pnl()
    .getByRole("button", { name: /Lê Văn Cả/ })
    .click();
  await pnl().getByRole("button", { name: "Đưa Lê Văn Nuôi lên trước" }).click();
  await expect(pnl().getByRole("listitem").first()).toContainText("Lê Văn Nuôi");
  await pnl().getByRole("button", { name: "Lê Văn Nuôi", exact: true }).click();
  await expect(pnl().getByText("Trưởng nam, trong 2 người con (con nuôi)")).toBeVisible();

  // đổi con nuôi thành con ruột
  await pnl().getByRole("button", { name: "Đổi cha mẹ, con ruột/nuôi" }).click();
  await pnl().getByText("Con ruột", { exact: true }).click();
  await pnl().getByRole("button", { name: "Lưu cha mẹ" }).click();
  await expect(pnl().getByText("Trưởng nam, trong 2 người con", { exact: true })).toBeVisible();
  await p.close();
});

test("trang công khai: ban quản lý nhập địa chỉ nhà thờ họ + ban liên lạc; khách chỉ thấy người đã khuất", async ({ browser }) => {
  const o = await browser.newPage();
  await loginOwner(o);
  await o.getByRole("link", { name: "Cài đặt" }).click();
  await o.getByLabel("Địa chỉ nhà thờ họ").fill("Thôn Thử, xã An Hoà");
  await o.getByRole("button", { name: "Lưu trang chủ" }).click();
  await expect(o.getByText("Đã lưu. Xem ở thẻ Trang chủ.")).toBeVisible();
  const lienHe = o.locator("#lien-he");
  await lienHe.getByRole("button", { name: "Thêm người liên hệ" }).click();
  await lienHe.getByLabel("Họ và tên", { exact: true }).fill("Lê Văn Trưởng");
  await lienHe.getByLabel("Vai trò", { exact: true }).fill("Trưởng họ");
  await lienHe.getByLabel("Số điện thoại", { exact: true }).fill("0912 999 888");
  await lienHe.getByRole("button", { name: "Thêm người liên hệ" }).click();
  await expect(lienHe.getByText("Cần xác nhận người này đồng ý công khai")).toBeVisible();
  await lienHe.getByText("đã đồng ý", { exact: false }).click();
  await lienHe.getByRole("button", { name: "Thêm người liên hệ" }).click();
  await expect(lienHe.getByText("Trang công khai: hiện số điện thoại")).toBeVisible();
  await o.close();

  // khách: trình duyệt mới, chưa đăng nhập
  const g = await browser.newPage();
  await g.goto("/");
  await expect(g).toHaveURL(/\/xem$/);
  await expect(g.getByRole("heading", { level: 1, name: "Họ Lê Văn – thôn Thử" })).toBeVisible();
  await expect(g.getByText("Thôn Thử, xã An Hoà")).toBeVisible();
  await expect(g.getByRole("link", { name: "Chỉ đường" })).toHaveAttribute("href", /google\.com\/maps/);
  const contact = g.getByRole("listitem").filter({ hasText: "Lê Văn Trưởng" });
  await expect(contact.getByText("Trưởng họ")).toBeVisible();
  await expect(contact.getByRole("link", { name: "0912 999 888" })).toHaveAttribute("href", "tel:+84912999888");
  await expect(contact.getByRole("link", { name: "Zalo" })).toHaveAttribute("href", "https://zalo.me/0912999888");

  await g.getByRole("link", { name: "Phả đồ", exact: true }).click();
  await expect(g.locator(node("Lê Văn Cả"))).toBeVisible();
  await expect(g.locator(node("Lê Văn Con Trưởng"))).toHaveCount(0); // còn sống
  await g.locator(node("Lê Văn Cả")).click();
  const pnl = g.getByRole("complementary", { name: "Thông tin người được chọn" });
  await expect(pnl.getByText("Đồi Thông")).toBeVisible();
  await expect(pnl.getByRole("button", { name: /Lê Văn Nuôi/ })).toHaveCount(0); // con còn sống bị lược
  await expect(pnl.getByRole("button", { name: "Sửa thông tin" })).toHaveCount(0);

  await g.getByRole("link", { name: "Lịch giỗ" }).click();
  await expect(g.getByRole("listitem").filter({ hasText: "Lê Văn Cả" })).toBeVisible();
  // khu thành viên vẫn đòi đăng nhập
  await g.getByRole("link", { name: "Đăng nhập" }).click();
  await expect(g).toHaveURL(/\/dang-nhap/);
  await g.close();
});

test("khách gửi lời nhắn, link chia sẻ có ảnh xem trước; ban quản lý trả lời và xem thống kê", async ({ browser }) => {
  const g = await browser.newPage();
  // thẻ xem trước khi gửi link lên Zalo / Facebook: trang dựng sẵn, máy chủ web tự làm mới trong ~15 giây sau khi có ảnh banner
  await expect
    .poll(
      async () => {
        await g.goto("/xem");
        return g
          .locator('meta[property="og:image"]')
          .getAttribute("content")
          .catch(() => null);
      },
      { timeout: 45_000, intervals: [2000] },
    )
    .toMatch(/^http:\/\/localhost:3000\/api\/v1\/public\/media\/[0-9a-f-]+\/lg$/);
  await expect(g.locator('meta[property="og:title"]')).toHaveAttribute("content", "Họ Lê Văn – thôn Thử");
  await expect(g).toHaveTitle("Họ Lê Văn – thôn Thử");

  await g.getByRole("link", { name: "Gửi lời nhắn cho ban quản lý" }).click();
  await expect(g).toHaveURL(/\/xem\/lien-he#gui-loi-nhan$/);
  await expect(g).toHaveTitle("Liên hệ · Họ Lê Văn – thôn Thử");
  await g.getByLabel("Họ tên").fill("Lê Thị Xa Quê");
  await g.getByLabel("Số điện thoại hoặc email").fill("abc");
  await g.getByRole("textbox", { name: "Lời nhắn", exact: true }).fill("Xin bổ sung tên các cháu ở Sài Gòn");
  await g.getByRole("button", { name: "Gửi lời nhắn" }).click();
  await expect(g.getByText("Số điện thoại hoặc email chưa đúng")).toBeVisible();
  await g.getByLabel("Số điện thoại hoặc email").fill("0903 111 222");
  await g.getByRole("button", { name: "Gửi lời nhắn" }).click();
  await expect(g.getByRole("status")).toContainText("Ban quản lý sẽ liên lạc lại qua 0903 111 222");
  await expect(g.getByText(/Đang xem: \d+ · Hôm nay: \d+ lượt/)).toBeVisible();
  await g.close();

  const o = await browser.newPage();
  await loginOwner(o);
  await expect(o.getByRole("link", { name: /Cài đặt\s*, có 1\s*lời nhắn mới của khách/ })).toBeVisible();
  await o.getByRole("link", { name: /Cài đặt/ }).click();
  const inbox = o.locator("#loi-nhan");
  await expect(inbox.getByRole("heading", { name: "Lời nhắn của khách (1 chưa trả lời)" })).toBeVisible();
  await expect(inbox.getByText("Xin bổ sung tên các cháu ở Sài Gòn")).toBeVisible();
  await expect(inbox.getByRole("link", { name: "0903 111 222" })).toHaveAttribute("href", "tel:+84903111222");
  await inbox.getByRole("button", { name: "Đã trả lời" }).click();
  await expect(inbox.getByText("Đã trả lời hết lời nhắn.")).toBeVisible();

  await o.getByRole("link", { name: "Thống kê" }).click();
  await expect(o.getByRole("heading", { name: "Thống kê truy cập" })).toBeVisible();
  await expect(o.getByText("Đang xem ngay lúc này")).toBeVisible();
  const total = o.locator("dt", { hasText: "Tổng từ trước đến nay" }).locator("xpath=following-sibling::dd");
  await expect(total).not.toHaveText("0");
  await expect(o.getByRole("heading", { name: "Trang được xem nhiều" })).toBeVisible();
  await expect(o.getByText("Liên hệ (công khai)")).toBeVisible();
  await o.getByRole("button", { name: "7 ngày" }).click();
  await expect(o.getByRole("button", { name: "7 ngày" })).toHaveAttribute("aria-pressed", "true");
  await o.close();
});

test("thư viện ảnh: tạo album, tải nhiều ảnh, đặt bìa, công khai cho khách xem", async ({ browser }) => {
  const o = await browser.newPage();
  await loginOwner(o);
  await o.getByRole("link", { name: "Ảnh", exact: true }).click();
  await expect(o.getByRole("heading", { name: "Thư viện ảnh" })).toBeVisible();
  // banner và chân dung tải lên trước đó nằm ở "Ảnh lẻ"
  await expect(o.getByRole("link", { name: /Ảnh lẻ/ })).toBeVisible();

  await o.getByRole("button", { name: "Tạo album" }).click();
  await o.getByRole("button", { name: "Tạo album" }).click();
  await expect(o.getByText("Cần đặt tên album")).toBeVisible();
  await o.getByLabel("Tên album").fill("Giỗ Tổ năm 2026");
  await o.getByLabel("Mô tả (không bắt buộc)").fill("Mười hai tháng Ba, nhà thờ họ");
  await o.getByRole("button", { name: "Tạo album" }).click();

  await expect(o.getByRole("heading", { name: "Giỗ Tổ năm 2026" })).toBeVisible();
  await expect(o.getByText("0 ảnh · Chỉ thành viên xem")).toBeVisible();
  await o.locator("input[type=file]").setInputFiles([fixture("banner-1.jpg"), fixture("banner-2.jpg"), fixture("chan-dung.jpg")]);
  await expect(o.getByText("3 ảnh · Chỉ thành viên xem")).toBeVisible({ timeout: 20_000 });

  // chọn ảnh thứ hai làm bìa, ghi chú thích
  await o.getByRole("button", { name: "Chọn ảnh" }).click();
  await o.getByRole("button", { name: "Chọn ảnh 2" }).click();
  await expect(o.getByText("Đã chọn 1 ảnh")).toBeVisible();
  await o.getByRole("button", { name: "Đặt làm ảnh bìa" }).click();
  await expect(o.getByRole("button", { name: "Đang là ảnh bìa" })).toBeDisabled();
  await o.getByRole("button", { name: "Sửa chú thích" }).click();
  await o.getByLabel("Chú thích ảnh").fill("Con cháu dâng hương");
  await o.getByRole("button", { name: "Lưu" }).click();
  await expect(o.getByRole("button", { name: "Bỏ chọn Con cháu dâng hương" })).toBeVisible();
  await o.getByRole("button", { name: "Xong" }).click();

  // xem lớn
  await o.getByRole("button", { name: "Xem Con cháu dâng hương" }).click();
  await expect(o.getByRole("dialog")).toContainText("Con cháu dâng hương");
  await o.keyboard.press("Escape");

  // để công khai
  await o.getByRole("button", { name: "Sửa album" }).click();
  await o.getByLabel(/^Công khai/).check();
  await o.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(o.getByText("3 ảnh · Công khai trên trang dòng họ")).toBeVisible();
  await o.close();

  const g = await browser.newPage();
  await g.goto("/xem");
  await g.getByRole("link", { name: "Ảnh", exact: true }).click();
  await expect(g).toHaveTitle("Thư viện ảnh · Họ Lê Văn – thôn Thử");
  await g.getByRole("link", { name: /Giỗ Tổ năm 2026/ }).click();
  await expect(g.getByRole("heading", { name: "Giỗ Tổ năm 2026" })).toBeVisible();
  await expect(g.getByText("Mười hai tháng Ba, nhà thờ họ")).toBeVisible();
  await expect(g.getByRole("button", { name: /^Xem / })).toHaveCount(3);
  // ảnh lẻ (chân dung người còn sống…) không có trên trang công khai
  await expect(g.getByText("Ảnh lẻ")).toHaveCount(0);
  await g.close();
});

test("nhập – xuất: in phả đồ PDF, xuất danh sách Excel, thêm dòng rồi nhập lại, hoàn tác", async ({ browser }) => {
  // thư mục không dấu: Playwright không đưa được file từ đường dẫn có dấu tiếng Việt vào ô chọn file
  const dir = await mkdtemp(join(tmpdir(), "coinguon-e2e-"));
  const o = await browser.newPage();
  await loginOwner(o);
  await o.getByRole("link", { name: "Phả đồ", exact: true }).click();
  await o.locator(node("Lê Văn Cả")).click();
  await o.waitForURL(/nguoi=/);
  const rootId = new URL(o.url()).searchParams.get("nguoi")!;
  await o.getByRole("link", { name: "In / Xuất" }).click();
  await expect(o.getByRole("heading", { name: "Nhập – xuất" })).toBeVisible();
  // bắt đầu từ người đang chọn trên phả đồ
  await expect(o.getByText("Lê Văn Cả", { exact: true })).toBeVisible();
  await expect(o.getByText(/\d+ người, \d+ đời → 1 trang A3/)).toBeVisible();
  await o.getByLabel("Khổ giấy").selectOption("A4");
  await expect(o.getByText(/→ 1 trang A4/)).toBeVisible();
  const [pdf] = await Promise.all([o.waitForEvent("download"), o.getByRole("link", { name: "Tải PDF để in" }).click()]);
  expect(pdf.suggestedFilename()).toBe("pha-do-ho-le-van-thon-thu.pdf");
  expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe("%PDF-");

  // xuất danh sách → thêm một người con của thuỷ tổ → nhập lại
  const [list] = await Promise.all([o.waitForEvent("download"), o.getByRole("link", { name: "Xuất danh sách Excel" }).click()]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await readFile((await list.path())!)) as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("Danh sách")!;
  ws.addRow(["N1", "Lê Văn Nhập", "Nam", rootId, "", "", "", "", "", "khoảng 1990"]);
  ws.addRow(["N2", "Lê Văn Lạc", "Nam", "KHONG-CO"]);
  const bad = join(dir, "loi.xlsx");
  await wb.xlsx.writeFile(bad);
  await o.getByLabel("Chọn file Excel để nhập").setInputFiles(bad);
  await expect(o.getByRole("heading", { name: /1 lỗi trong “loi.xlsx” — chưa nhập gì/ })).toBeVisible();
  await expect(o.getByRole("cell", { name: "Mã cha “KHONG-CO” không có trong file (và không phải mã người đã có)" })).toBeVisible();
  const [errFile] = await Promise.all([o.waitForEvent("download"), o.getByRole("link", { name: "Tải file đánh dấu lỗi" }).click()]);
  expect(errFile.suggestedFilename()).toBe("gia-pha-danh-dau-loi.xlsx");

  ws.spliceRows(ws.rowCount, 1);
  const good = join(dir, "them-con.xlsx");
  await wb.xlsx.writeFile(good);
  await o.getByLabel("Chọn file Excel để nhập").setInputFiles(good);
  await expect(o.getByRole("heading", { name: "File “them-con.xlsx” hợp lệ" })).toBeVisible();
  await expect(o.getByText(/dòng là người đã có trong phả — bỏ qua, không sửa/)).toBeVisible();
  await o.getByRole("button", { name: "Xác nhận nhập 1 người" }).click();
  await expect(o.getByRole("status")).toContainText("Đã nhập 1 người.");
  await o.getByRole("link", { name: "Mở phả đồ" }).click();
  await expect(o.locator(node("Lê Văn Nhập"))).toBeVisible();

  // hoàn tác trong 24 giờ
  await o.goto(o.url().replace(/\/pha-do.*$/, "/nhap-xuat"));
  o.once("dialog", (d) => void d.accept());
  await o.getByRole("button", { name: "Hoàn tác lần nhập này" }).click();
  await expect(o.getByText(/Đã hoàn tác/)).toBeVisible();
  await o.getByRole("link", { name: "Phả đồ", exact: true }).click();
  await expect(o.locator(node("Lê Văn Cả"))).toBeVisible();
  await expect(o.locator(node("Lê Văn Nhập"))).toHaveCount(0);
  await o.close();
});

test("ngày giỗ âm lịch ghi riêng khi không rõ ngày mất; có ngày mất thì tự tính", async ({ browser }) => {
  const p = await browser.newPage();
  await loginOwner(p);
  await p.getByRole("link", { name: "Phả đồ", exact: true }).click();
  const pnl = () => p.getByRole("complementary", { name: "Thông tin người được chọn" });
  await p.locator(node("Lê Văn Cả")).click();

  // có ngày mất đủ ngày tháng → ngày giỗ tự tính, không có ô ghi riêng
  await pnl().getByRole("button", { name: "Sửa thông tin" }).click();
  await expect(pnl().getByText("mùng 1 tháng Giêng (âm lịch)")).toBeVisible();
  await expect(pnl().getByText("— tự tính từ ngày mất.")).toBeVisible();
  await expect(pnl().getByLabel("Ngày giỗ — ngày âm lịch")).toHaveCount(0);
  await pnl().getByRole("button", { name: "Huỷ" }).click();

  // con đã mất, phả chỉ ghi ngày giỗ
  await pnl().getByRole("button", { name: "Thêm con với Hai" }).click();
  await pnl().getByLabel("Họ và tên").fill("Lê Văn Giỗ");
  await pnl().getByText("Đã mất", { exact: true }).click();
  await pnl().getByLabel("Ngày giỗ — ngày âm lịch").fill("12");
  await pnl().getByRole("button", { name: "Thêm con", exact: true }).click();
  await expect(pnl().getByText("Cần nhập cả ngày và tháng âm lịch")).toBeVisible();
  await pnl().getByLabel("Ngày giỗ — tháng âm lịch").fill("3");
  await pnl().getByRole("button", { name: "Thêm con", exact: true }).click();
  await expect(pnl().getByRole("heading", { name: "Lê Văn Giỗ" })).toBeVisible();
  await expect(pnl().getByText("ngày 12 tháng 3 (âm lịch)")).toBeVisible();

  // sửa lại: ô ngày giỗ điền sẵn, đổi sang tháng nhuận
  await pnl().getByRole("button", { name: "Sửa thông tin" }).click();
  await expect(pnl().getByLabel("Ngày giỗ — ngày âm lịch")).toHaveValue("12");
  await expect(pnl().getByLabel("Ngày giỗ — tháng âm lịch")).toHaveValue("3");
  await pnl().getByLabel("Tháng nhuận").check();
  await pnl().getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(pnl().getByText("ngày 12 tháng 3 nhuận (âm lịch)")).toBeVisible();

  await p.getByRole("link", { name: "Lịch giỗ" }).click();
  await expect(p.getByRole("link", { name: "Lê Văn Giỗ" })).toBeVisible();
  await p.close();
});

/** File WAV im lặng ngắn — đủ để thử tải lên và phát nhạc nền */
function silentWav(seconds = 1) {
  const rate = 8000;
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n, 128);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(36 + n, 4);
  b.write("WAVEfmt ", 8, "latin1");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write("data", 36, "latin1");
  b.writeUInt32LE(n, 40);
  return b;
}

test("trang đăng nhập: bên trái là hoành phi tên dòng họ, câu đối, số đời", async ({ browser }) => {
  const p = await browser.newPage();
  await p.goto("/dang-nhap");
  const side = p.getByRole("complementary");
  await expect(side.getByText("Họ Lê Văn – thôn Thử")).toBeVisible();
  await expect(side.getByLabel(/^Câu đối bên trái: /)).toBeVisible();
  await expect(side.getByText(/Trong phả công khai:/)).toBeVisible();
  await p.close();
});

test("nhạc nền: quản trị tải lên; người xem tự bật (mặc định tắt), lần sau vào vẫn nhớ", async ({ browser }) => {
  const p = await browser.newPage();
  await loginOwner(p);
  const toggle = p.getByRole("button", { name: "Nhạc nền", exact: true });
  await expect(toggle).toHaveCount(0); // chưa có nhạc thì không có nút
  await p.getByRole("link", { name: "Cài đặt" }).click();
  await p.getByLabel("Chọn bản nhạc").setInputFiles({ name: "nhac-dan-tranh.wav", mimeType: "audio/wav", buffer: silentWav() });
  await p.getByLabel("Tên bản nhạc (không bắt buộc)").fill("Nhạc nhà thờ họ");
  await p.getByRole("button", { name: "Tải nhạc lên" }).click();
  await expect(p.getByText("Đã thay nhạc nền")).toBeVisible();
  await expect(p.locator("#nhac-nen").getByText("Nhạc nhà thờ họ")).toBeVisible();

  // mặc định tắt; bấm thì bật, chuyển thẻ nhạc không ngắt
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveAttribute("title", "Đang phát: Nhạc nhà thờ họ");
  expect(await p.evaluate(() => localStorage.getItem("coinguon:nhac"))).toBe("1");
  await p.getByRole("link", { name: "Lịch giỗ" }).click();
  await expect(toggle).toHaveAttribute("title", "Đang phát: Nhạc nhà thờ họ");

  // tải lại trang: trình duyệt chặn tự phát → chờ lần chạm đầu tiên rồi phát
  await p.reload();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await p.getByRole("heading", { level: 1 }).click();
  await expect(toggle).toHaveAttribute("title", "Đang phát: Nhạc nhà thờ họ");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(await p.evaluate(() => localStorage.getItem("coinguon:nhac"))).toBeNull();

  // khách trên trang công khai cũng có nút, mặc định tắt
  const guest = await browser.newPage();
  await guest.goto("/xem");
  await expect(guest.getByRole("button", { name: "Nhạc nền", exact: true })).toHaveAttribute("aria-pressed", "false");
  await guest.close();
  await p.close();
});

test("tài khoản của tôi: đổi số điện thoại cần mật khẩu hiện tại; đổi mật khẩu", async ({ browser }) => {
  const p = await browser.newPage();
  await loginOwner(p);
  await p.getByRole("link", { name: /^Lê Văn Quản/ }).click();
  await expect(p.getByRole("heading", { name: "Tài khoản của tôi" })).toBeVisible();
  await expect(p.getByLabel("Email")).toHaveValue(OWNER.email);

  await p.getByLabel("Số điện thoại").fill("0977 888 999");
  await p.getByRole("button", { name: "Lưu thông tin" }).click();
  await expect(p.getByText("Nhập mật khẩu hiện tại để đổi email / số điện thoại")).toBeVisible();
  await p.getByLabel("Mật khẩu hiện tại").first().fill(OWNER.password);
  await p.getByRole("button", { name: "Lưu thông tin" }).click();
  await expect(p.getByText("Đã lưu thông tin")).toBeVisible();

  // đổi mật khẩu: sai mật khẩu cũ báo đúng ô; đổi xong đăng nhập được bằng SĐT mới + mật khẩu mới
  const pw = p.locator("form").filter({ has: p.getByRole("button", { name: "Đổi mật khẩu" }) });
  await pw.getByLabel("Mật khẩu hiện tại").fill("sai-mat-khau");
  await pw.getByLabel("Mật khẩu mới", { exact: true }).fill("mat-khau-tam-456");
  await pw.getByLabel("Nhập lại mật khẩu mới").fill("mat-khau-tam-456");
  await pw.getByRole("button", { name: "Đổi mật khẩu" }).click();
  await expect(pw.getByText("Mật khẩu hiện tại không đúng")).toBeVisible();
  await pw.getByLabel("Mật khẩu hiện tại").fill(OWNER.password);
  await pw.getByRole("button", { name: "Đổi mật khẩu" }).click();
  await expect(p.getByText("Đã đổi mật khẩu. Các máy khác đã được đăng xuất.")).toBeVisible();

  const q = await browser.newPage();
  await q.goto("/dang-nhap");
  await q.getByLabel("Số điện thoại hoặc email").fill("0977888999");
  await q.getByLabel("Mật khẩu").fill("mat-khau-tam-456");
  await q.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(q.getByRole("heading", { level: 1, name: "Họ Lê Văn – thôn Thử" })).toBeVisible();
  await q.close();

  // đổi lại mật khẩu cũ cho các bước sau (luồng điện thoại dùng lại tài khoản này)
  await pw.getByLabel("Mật khẩu hiện tại").fill("mat-khau-tam-456");
  await pw.getByLabel("Mật khẩu mới", { exact: true }).fill(OWNER.password);
  await pw.getByLabel("Nhập lại mật khẩu mới").fill(OWNER.password);
  await pw.getByRole("button", { name: "Đổi mật khẩu" }).click();
  await expect(p.getByText("Đã đổi mật khẩu. Các máy khác đã được đăng xuất.")).toBeVisible();
  await p.close();
});

test("quản trị sửa tài khoản người có vai trò thấp hơn và đặt mật khẩu mới thay họ", async ({ browser }) => {
  const o = await browser.newPage();
  await loginOwner(o);
  await o.getByRole("link", { name: "Cài đặt" }).click();
  // tài khoản của chính mình không sửa ở đây
  await expect(o.getByRole("listitem").filter({ hasText: "(bạn)" }).getByRole("button", { name: "Sửa tài khoản" })).toHaveCount(0);
  const row = o.getByRole("listitem").filter({ hasText: "0905 222 333" });
  await row.getByRole("button", { name: "Sửa tài khoản" }).click();
  const form = o.getByRole("form", { name: "Sửa tài khoản của Lê Văn Cụ" });
  await form.getByLabel("Họ và tên").fill("Lê Văn Cụ Ông");
  await form.getByLabel("Mật khẩu mới (không bắt buộc)").fill("ngan");
  await form.getByRole("button", { name: "Lưu tài khoản" }).click();
  await expect(form.getByText("Mật khẩu tối thiểu 8 ký tự")).toBeVisible();
  await form.getByLabel("Mật khẩu mới (không bắt buộc)").fill("quan-tri-dat-cho-cu");
  await form.getByRole("button", { name: "Lưu tài khoản" }).click();
  await expect(o.getByText("Đã lưu. Báo Lê Văn Cụ Ông đăng nhập lại bằng mật khẩu mới.")).toBeVisible();
  await expect(o.getByLabel("Vai trò của Lê Văn Cụ Ông")).toHaveValue("member");

  const q = await browser.newPage();
  await q.goto("/dang-nhap");
  await q.getByLabel("Số điện thoại hoặc email").fill("0905222333");
  await q.getByLabel("Mật khẩu").fill("quan-tri-dat-cho-cu");
  await q.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(q.getByText("Lê Văn Cụ Ông · Thành viên")).toBeVisible();
  await q.close();
  await o.close();
});
