import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sniffAudio } from "../src/site/music.controller.js";
import { bootApp, Client, resetDatabase } from "./helpers.js";

// Tài khoản của tôi (đổi thông tin, đổi mật khẩu), quản trị sửa tài khoản thành viên, nhạc nền
let app: INestApplication;
let mediaDir: string;
let owner: Client;
let admin: Client;
let editor: Client;
let member: Client;
let clanId: string;
const memberId: Record<string, string> = {};
const url = (p: string) => `/clans/${clanId}${p}`;
const guest = () => request(app.getHttpServer());

/** File WAV 0,1 giây im lặng */
function wav(seconds = 0.1) {
  const rate = 8000;
  const n = Math.floor(rate * seconds);
  const b = Buffer.alloc(44 + n);
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
  b.fill(128, 44);
  return b;
}

async function join2(role: "admin" | "editor" | "member", email: string, name: string) {
  const inv = await owner.post(url("/invitations"), { role });
  const c = new Client(app);
  await c.register(email, name);
  await c.post(`/invitations/${inv.body.token}/accept`);
  return c;
}

/** Đăng nhập bằng email/SĐT + mật khẩu, trả mã trạng thái */
const login = (identifier: string, password: string) => guest().post("/api/v1/auth/login").send({ identifier, password });

beforeAll(async () => {
  await resetDatabase();
  mediaDir = mkdtempSync(join(tmpdir(), "coinguon-music-"));
  app = await bootApp({ CLAN_MODE: "single", MEDIA_DIR: mediaDir });
  owner = new Client(app);
  await owner.register("truong-ho@example.com", "Trưởng họ");
  clanId = (await owner.post("/clans", { name: "Họ Bùi", slug: "ho-bui", surname: "Bùi" })).body.id;
  admin = await join2("admin", "quan-tri@example.com", "Quản trị");
  editor = await join2("editor", "bien-tap@example.com", "Biên tập");
  member = await join2("member", "thanh-vien@example.com", "Thành viên");
  for (const m of (await owner.get(url("/members"))).body as Array<{ id: string; email: string }>) memberId[m.email] = m.id;
});
afterAll(async () => {
  await app.close();
  rmSync(mediaDir, { recursive: true, force: true });
});

describe("Tài khoản của tôi", () => {
  it("đổi họ tên không cần mật khẩu; đổi email / SĐT cần mật khẩu hiện tại", async () => {
    expect((await admin.patch("/me/account", { name: "Bùi Văn Quản" })).body).toMatchObject({ name: "Bùi Văn Quản" });
    const noPass = await admin.patch("/me/account", { phone: "0912 000 111" });
    expect(noPass.status).toBe(422);
    expect(noPass.body.details).toEqual([expect.objectContaining({ path: "currentPassword" })]);
    const wrong = await admin.patch("/me/account", { phone: "0912 000 111", currentPassword: "sai-mat-khau" });
    expect(wrong.body.details).toEqual([{ path: "currentPassword", message: "Mật khẩu hiện tại không đúng" }]);
    const ok = await admin.patch("/me/account", { phone: "0912 000 111", email: "", currentPassword: "matkhau-an-toan" });
    expect(ok.body).toMatchObject({ phone: "+84912000111", email: null });
    expect((await login("0912000111", "matkhau-an-toan")).status).toBe(200);
    expect((await admin.get("/me")).body).toMatchObject({ name: "Bùi Văn Quản", phone: "+84912000111", email: null });
  });

  it("không bỏ được cả email lẫn SĐT; không lấy email của người khác", async () => {
    const none = await admin.patch("/me/account", { phone: null, currentPassword: "matkhau-an-toan" });
    expect(none.body.code).toBe("LOGIN_ID_REQUIRED");
    const taken = await admin.patch("/me/account", { email: "truong-ho@example.com", currentPassword: "matkhau-an-toan" });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("EMAIL_TAKEN");
  });

  it("đổi mật khẩu: sai mật khẩu cũ → 422; đúng thì mật khẩu mới dùng được, thiết bị khác bị đăng xuất", async () => {
    const other = new Client(app);
    await other.login("thanh-vien@example.com");
    expect((await member.post("/me/password", { currentPassword: "sai", newPassword: "mat-khau-moi-456" })).status).toBe(422);
    expect((await member.post("/me/password", { currentPassword: "matkhau-an-toan", newPassword: "ngan" })).body.details).toEqual([
      expect.objectContaining({ path: "newPassword", message: "Mật khẩu tối thiểu 8 ký tự" }),
    ]);
    expect((await member.post("/me/password", { currentPassword: "matkhau-an-toan", newPassword: "mat-khau-moi-456" })).status).toBe(204);
    // máy đang dùng vẫn đăng nhập, máy khác bị đăng xuất
    expect((await member.get("/me")).status).toBe(200);
    expect((await other.get("/me")).status).toBe(401);
    expect((await login("thanh-vien@example.com", "matkhau-an-toan")).status).toBe(401);
    expect((await login("thanh-vien@example.com", "mat-khau-moi-456")).status).toBe(200);
  });
});

describe("Quản trị sửa tài khoản thành viên", () => {
  it("quản trị sửa được biên tập viên, thành viên: tên, email, SĐT, đặt mật khẩu mới", async () => {
    const res = await admin.patch(url(`/members/${memberId["bien-tap@example.com"]}/account`), {
      name: "Bùi Thị Biên",
      phone: "0905 222 333",
      newPassword: "do-quan-tri-dat-1",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Bùi Thị Biên", phone: "+84905222333", email: "bien-tap@example.com", passwordSet: true });
    // người đó bị đăng xuất, đăng nhập bằng mật khẩu mới
    expect((await editor.get("/me")).status).toBe(401);
    expect((await login("0905222333", "do-quan-tri-dat-1")).status).toBe(200);
    const list = (await owner.get(url("/members"))).body.find((m: { id: string }) => m.id === memberId["bien-tap@example.com"]);
    expect(list).toMatchObject({ name: "Bùi Thị Biên", phone: "+84905222333" });
  });

  it("quản trị đổi vai trò người thấp hơn; không sửa được quản trị khác, chủ sở hữu, hay chính mình", async () => {
    expect((await admin.patch(url(`/members/${memberId["thanh-vien@example.com"]}`), { role: "editor" })).body.role).toBe("editor");
    expect((await admin.patch(url(`/members/${memberId["thanh-vien@example.com"]}`), { role: "admin" })).body.code).toBe("ROLE_TOO_LOW");
    expect((await admin.patch(url(`/members/${memberId["truong-ho@example.com"]}/account`), { name: "Chiếm quyền" })).body.code).toBe("ROLE_TOO_LOW");
    expect((await admin.patch(url(`/members/${memberId["quan-tri@example.com"]}/account`), { name: "Tự sửa" })).body.code).toBe("USE_OWN_ACCOUNT_PAGE");
    // chủ sở hữu sửa được quản trị
    expect((await owner.patch(url(`/members/${memberId["quan-tri@example.com"]}/account`), { name: "Bùi Văn Quản Trị" })).body.name).toBe("Bùi Văn Quản Trị");
    // biên tập viên không vào được chức năng này
    const ed = new Client(app);
    await ed.login("0905222333", "do-quan-tri-dat-1");
    expect((await ed.patch(url(`/members/${memberId["thanh-vien@example.com"]}/account`), { name: "X" })).status).toBe(403);
  });

  it("SĐT trùng người khác → 409 đúng ô", async () => {
    const res = await admin.patch(url(`/members/${memberId["thanh-vien@example.com"]}/account`), { phone: "0912000111" });
    expect(res.status).toBe(409);
    expect(res.body.details).toEqual([{ path: "phone", message: "Số điện thoại này đã có tài khoản khác" }]);
  });
});

describe("Nhạc nền", () => {
  it("nhận dạng file âm thanh bằng nội dung", () => {
    expect(sniffAudio(wav())).toEqual({ mime: "audio/wav", ext: "wav" });
    expect(sniffAudio(Buffer.concat([Buffer.from("ID3"), Buffer.alloc(20)]))).toEqual({ mime: "audio/mpeg", ext: "mp3" });
    expect(sniffAudio(Buffer.from("<html>không phải nhạc</html>"))).toBeNull();
  });

  it("chưa có nhạc → null; thành viên thường không tải lên được; file không phải nhạc → 422", async () => {
    expect((await guest().get("/api/v1/public/music")).body).toEqual({ music: null });
    const up = (c: Client, buf: Buffer, name = "nhac.wav") =>
      c.agent
        .put(`/api/v1${url("/site/music")}`)
        .set("X-CSRF-Token", c.csrf)
        .attach("file", buf, name);
    expect((await up(member, wav())).status).toBe(403);
    const bad = await up(owner, Buffer.from("<html>giả làm mp3</html>"), "nhac.mp3");
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe("NOT_AUDIO");
  });

  it("quản trị tải lên, khách nghe được (có tua), đổi tên, thay bài, xoá", async () => {
    const res = await admin.agent
      .put(`/api/v1${url("/site/music")}`)
      .set("X-CSRF-Token", admin.csrf)
      .field("title", "Lý cây đa (đàn tranh)")
      .attach("file", wav(0.5), "ly-cay-da.wav");
    expect(res.status).toBe(200);
    expect(res.body.music).toMatchObject({ title: "Lý cây đa (đàn tranh)", mime: "audio/wav", sizeBytes: 4044 });

    const pub = (await guest().get("/api/v1/public/music")).body.music;
    expect(pub.url).toMatch(/^\/api\/v1\/public\/music\/file\?v=\d+$/);
    const file = await guest().get(pub.url).set("Range", "bytes=0-99");
    expect(file.status).toBe(206);
    expect(file.headers["content-type"]).toBe("audio/wav");
    expect(file.headers["content-range"]).toBe("bytes 0-99/4044");

    expect((await member.get(url("/site/music"))).body.music.title).toBe("Lý cây đa (đàn tranh)");
    expect((await admin.patch(url("/site/music"), { title: "Nhạc nhà thờ họ" })).body.music.title).toBe("Nhạc nhà thờ họ");

    const again = await admin.agent
      .put(`/api/v1${url("/site/music")}`)
      .set("X-CSRF-Token", admin.csrf)
      .attach("file", wav(0.2), "bai-moi.wav");
    // không ghi tên: lấy tên file
    expect(again.body.music.title).toBe("bai-moi");
    expect(again.body.music.url).not.toBe(pub.url);

    expect((await admin.delete(url("/site/music"))).status).toBe(204);
    expect((await guest().get("/api/v1/public/music")).body).toEqual({ music: null });
    expect((await guest().get("/api/v1/public/music/file")).status).toBe(404);
  });
});
