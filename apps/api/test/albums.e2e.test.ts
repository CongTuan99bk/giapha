import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootApp, Client, resetDatabase } from "./helpers.js";

// Thư viện ảnh theo album: thành viên xem, biên tập viên sắp xếp; khách chỉ thấy album công khai
let app: INestApplication;
let mediaDir: string;
let owner: Client;
let editor: Client;
let member: Client;
let clanId: string;
const url = (p: string) => `/clans/${clanId}${p}`;
const guest = () => request(app.getHttpServer());
const image = (r: number) => sharp({ create: { width: 320, height: 240, channels: 3, background: { r, g: 120, b: 60 } } }).jpeg().toBuffer();

async function upload(c: Client, albumId?: string, caption?: string) {
  let req = c.agent.post(`/api/v1${url("/media")}`).set("X-CSRF-Token", c.csrf).attach("file", await image(Math.floor(Math.random() * 255)), "anh.jpg");
  if (albumId) req = req.field("albumId", albumId);
  if (caption) req = req.field("caption", caption);
  return req;
}

const ids: Record<string, string> = {};

beforeAll(async () => {
  await resetDatabase();
  mediaDir = mkdtempSync(join(tmpdir(), "coinguon-album-"));
  app = await bootApp({ CLAN_MODE: "single", MEDIA_DIR: mediaDir });
  owner = new Client(app);
  await owner.register("truong-ho@example.com", "Trưởng họ");
  clanId = (await owner.post("/clans", { name: "Họ Võ", slug: "ho-vo", surname: "Võ" })).body.id;
  for (const [role, email, name] of [
    ["editor", "bien-tap@example.com", "Biên tập"],
    ["member", "tv@example.com", "Thành viên"],
  ] as const) {
    const inv = await owner.post(url("/invitations"), { role });
    const c = new Client(app);
    await c.register(email, name);
    await c.post(`/invitations/${inv.body.token}/accept`);
    if (role === "editor") editor = c;
    else member = c;
  }
});
afterAll(async () => {
  await app.close();
  rmSync(mediaDir, { recursive: true, force: true });
});

describe("Album (thành viên)", () => {
  it("biên tập viên tạo album; thiếu tên → 422; thành viên thường không tạo được", async () => {
    const bad = await editor.post(url("/albums"), { title: "  " });
    expect(bad.status).toBe(422);
    expect(bad.body.details).toEqual([expect.objectContaining({ path: "title", message: "Cần đặt tên album" })]);
    expect((await member.post(url("/albums"), { title: "Của tôi" })).status).toBe(403);

    const a = await editor.post(url("/albums"), { title: "Giỗ Tổ 2026", description: "Ngày 12 tháng Ba", visibility: "public" });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ title: "Giỗ Tổ 2026", visibility: "public", count: 0, cover: null });
    ids.gio = a.body.id;
    // mặc định chỉ thành viên xem; mô tả trống → null
    const b = await editor.post(url("/albums"), { title: "Họp mặt gia đình", description: "" });
    expect(b.body).toMatchObject({ visibility: "members", description: null });
    ids.hop = b.body.id;
  });

  it("tải ảnh thẳng vào album; album không tồn tại → 404", async () => {
    const p1 = await upload(editor, ids.gio, "Lễ dâng hương");
    expect(p1.status).toBe(201);
    expect(p1.body.albumId).toBe(ids.gio);
    ids.p1 = p1.body.id;
    ids.p2 = (await upload(editor, ids.gio)).body.id;
    ids.p3 = (await upload(editor, ids.hop)).body.id;
    ids.le = (await upload(editor)).body.id;
    expect((await upload(editor, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  it("danh sách: số ảnh, ảnh bìa là ảnh đầu tiên, số ảnh lẻ", async () => {
    const res = await member.get(url("/albums"));
    expect(res.status).toBe(200);
    const gio = res.body.albums.find((a: { id: string }) => a.id === ids.gio);
    expect(gio).toMatchObject({ count: 2, cover: { id: ids.p1 } });
    expect(res.body.loose).toEqual({ count: 1 });
  });

  it("xem album: ảnh theo thứ tự tải lên, có ảnh gốc cho thành viên", async () => {
    const res = await member.get(url(`/albums/${ids.gio}`));
    expect(res.body.album).toMatchObject({ title: "Giỗ Tổ 2026", description: "Ngày 12 tháng Ba" });
    expect(res.body.photos.map((p: { id: string }) => p.id)).toEqual([ids.p1, ids.p2]);
    expect(res.body.photos[0].urls.orig).toMatch(/\/orig$/);
    const loose = await member.get(url("/albums/anh-le"));
    expect(loose.body).toMatchObject({ album: null, photos: [expect.objectContaining({ id: ids.le })] });
  });

  it("đặt ảnh bìa: phải là ảnh trong album", async () => {
    const wrong = await editor.patch(url(`/albums/${ids.gio}`), { coverId: ids.p3 });
    expect(wrong.status).toBe(422);
    expect(wrong.body.code).toBe("COVER_NOT_IN_ALBUM");
    expect((await editor.patch(url(`/albums/${ids.gio}`), { coverId: ids.p2, title: "Giỗ Tổ năm 2026" })).body).toMatchObject({ coverId: ids.p2, title: "Giỗ Tổ năm 2026" });
    const gio = (await member.get(url("/albums"))).body.albums.find((a: { id: string }) => a.id === ids.gio);
    expect(gio.cover.id).toBe(ids.p2);
  });

  it("chuyển ảnh sang album khác: ảnh bìa bị chuyển đi thì album tự lấy ảnh đầu", async () => {
    const res = await editor.post(url("/media/move"), { mediaIds: [ids.p2, ids.le], albumId: ids.hop });
    expect(res.body).toEqual({ moved: 2 });
    const list = (await member.get(url("/albums"))).body;
    const gio = list.albums.find((a: { id: string }) => a.id === ids.gio);
    expect(gio).toMatchObject({ count: 1, coverId: null, cover: { id: ids.p1 } });
    expect(list.albums.find((a: { id: string }) => a.id === ids.hop).count).toBe(3);
    expect(list.loose.count).toBe(0);
    expect((await member.post(url("/media/move"), { mediaIds: [ids.p1], albumId: null })).status).toBe(403);
  });
});

describe("Album trên trang công khai", () => {
  it("khách chỉ thấy album công khai có ảnh; ảnh chỉ có cỡ xem", async () => {
    const res = await guest().get("/api/v1/public/albums");
    expect(res.status).toBe(200);
    expect(res.body.albums.map((a: { title: string }) => a.title)).toEqual(["Giỗ Tổ năm 2026"]);
    expect(res.body.loose).toBeUndefined();
    const detail = await guest().get(`/api/v1/public/albums/${ids.gio}`);
    expect(detail.body.photos).toEqual([{ id: ids.p1, width: 320, height: 240, caption: "Lễ dâng hương", urls: { sm: expect.any(String), md: expect.any(String), lg: expect.any(String) } }]);
    expect((await guest().get(detail.body.photos[0].urls.md)).status).toBe(200);
  });

  it("album chỉ thành viên: khách không xem được album lẫn ảnh", async () => {
    expect((await guest().get(`/api/v1/public/albums/${ids.hop}`)).status).toBe(404);
    expect((await guest().get(`/api/v1/public/media/${ids.p3}/md`)).status).toBe(404);
  });

  it("đổi album sang 'chỉ thành viên' → biến khỏi trang công khai ngay", async () => {
    await editor.patch(url(`/albums/${ids.gio}`), { visibility: "members" });
    expect((await guest().get("/api/v1/public/albums")).body.albums).toEqual([]);
    expect((await guest().get(`/api/v1/public/media/${ids.p1}/md`)).status).toBe(404);
  });
});

describe("Xoá album", () => {
  it("mặc định giữ ảnh (về ảnh lẻ); ?xoaAnh=1 xoá luôn ảnh", async () => {
    expect((await editor.delete(url(`/albums/${ids.gio}`))).status).toBe(204);
    expect((await member.get(url(`/albums/${ids.gio}`))).status).toBe(404);
    let list = (await member.get(url("/albums"))).body;
    expect(list.loose.count).toBe(1);

    expect((await editor.delete(url(`/albums/${ids.hop}?xoaAnh=1`))).status).toBe(204);
    list = (await member.get(url("/albums"))).body;
    expect(list.albums).toEqual([]);
    expect(list.loose.count).toBe(1);
    expect((await member.get(url(`/media/${ids.p3}/sm`))).status).toBe(404);
  });
});
