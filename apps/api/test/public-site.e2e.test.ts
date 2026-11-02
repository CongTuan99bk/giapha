import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootApp, Client, resetDatabase } from "./helpers.js";

// Website công khai: chỉ người đã mất để chế độ "Mọi người"; ban liên lạc chỉ hiện trường được bật + đã đồng ý
let app: INestApplication;
let mediaDir: string;
let owner: Client;
let member: Client;
let clanId: string;
const id: Record<string, string> = {};
const media: Record<string, string> = {};

const guest = () => request(app.getHttpServer());
const url = (p: string) => `/clans/${clanId}${p}`;
const image = () => sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 180, b: 90 } } }).jpeg().toBuffer();
const upload = async (c: Client) =>
  (await c.agent.post(`/api/v1/clans/${clanId}/media`).set("X-CSRF-Token", c.csrf).attach("file", await image(), "a.jpg")).body.id as string;

beforeAll(async () => {
  await resetDatabase();
  mediaDir = mkdtempSync(join(tmpdir(), "coinguon-public-"));
  app = await bootApp({ CLAN_MODE: "single", MEDIA_DIR: mediaDir });
  owner = new Client(app);
  await owner.register("truong-ho@example.com", "Trưởng họ");
  clanId = (await owner.post("/clans", { name: "Họ Ngô", slug: "ho-ngo", surname: "Ngô" })).body.id;

  const lunarDeath = (day: number, month: number, year: number) => ({ calendar: "lunar", precision: "day", year, month, day });
  id.to = (await owner.post(url("/persons"), { fullName: "Ngô Văn Tổ", gender: "male", isLiving: false, deathDate: lunarDeath(12, 3, 1920) })).body.id;
  id.ba = (await owner.post(url(`/persons/${id.to}/spouses`), { person: { fullName: "Lê Thị Bà", gender: "female", isLiving: false } })).body.person.id;
  const child = (person: object) => owner.post(url(`/persons/${id.to}/children`), { person }).then((r) => r.body.person.id as string);
  id.song = await child({ fullName: "Ngô Văn Sống", gender: "male", isLiving: true });
  id.mat = await child({ fullName: "Ngô Văn Mất", gender: "male", isLiving: false, deathDate: lunarDeath(5, 8, 1990) });
  id.rieng = await child({ fullName: "Ngô Thị Riêng Tư", gender: "female", isLiving: false, privacy: "members", deathDate: lunarDeath(1, 1, 2000) });

  media.banner = await upload(owner);
  media.anhTo = await upload(owner);
  media.anhSong = await upload(owner);
  media.khac = await upload(owner);
  await owner.put(url(`/persons/${id.to}/avatar`), { mediaId: media.anhTo });
  await owner.put(url(`/persons/${id.song}/avatar`), { mediaId: media.anhSong });
  await owner.put(url("/site/home"), {
    banners: [{ mediaId: media.banner, caption: "Nhà thờ họ Ngô" }],
    couplet: { left: "Cây có cội", right: "Nước có nguồn" },
    motto: "Uống nước nhớ nguồn",
    templeAddress: "Thôn Đông, xã An Hoà, huyện Hoài Nhơn",
  });

  const inv = await owner.post(url("/invitations"), { role: "member" });
  member = new Client(app);
  await member.register("tv@example.com", "Thành viên");
  await member.post(`/invitations/${inv.body.token}/accept`);
});
afterAll(async () => {
  await app.close();
  rmSync(mediaDir, { recursive: true, force: true });
});

describe("Ban liên lạc (quản trị)", () => {
  it("bật công khai số điện thoại mà chưa xác nhận đồng ý → 422", async () => {
    const res = await owner.post(url("/contacts"), { name: "Ngô Văn Trưởng", role: "Trưởng họ", phone: "0912 111 222", showPhone: true });
    expect(res.status).toBe(422);
    expect(res.body.details).toEqual([expect.objectContaining({ path: "consent" })]);
  });

  it("thêm trưởng họ, trưởng chi, quản trị; sắp thứ tự", async () => {
    const a = await owner.post(url("/contacts"), { name: "Ngô Văn Trưởng", role: "Trưởng họ", phone: "0912 111 222", showPhone: true, consent: true });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ phone: "+84912111222", showPhone: true, consent: true });
    // form gửi ô trống dạng null
    const b = await owner.post(url("/contacts"), { name: "Ngô Văn Chi", role: "Trưởng chi 2", phone: "0905333444", email: null, showPhone: false });
    expect(b.status).toBe(201);
    const c = await owner.post(url("/contacts"), {
      name: "Ngô Quản Trị",
      role: "Quản trị website",
      phone: "0987000111",
      email: "quantri@example.com",
      showPhone: true,
      showEmail: true,
      consent: true,
      consentNote: "Tự nhập",
    });
    expect(c.status).toBe(201);
    expect((await owner.put(url("/contacts/order"), { ids: [a.body.id, c.body.id, b.body.id] })).status).toBe(204);
    const list = (await owner.get(url("/contacts"))).body;
    expect(list.map((x: { role: string }) => x.role)).toEqual(["Trưởng họ", "Quản trị website", "Trưởng chi 2"]);
  });

  it("thành viên thường không xem/sửa danh sách đầy đủ", async () => {
    expect((await member.get(url("/contacts"))).status).toBe(403);
  });
});

describe("Trang công khai (không đăng nhập)", () => {
  it("trang chủ: tên, câu đối, địa chỉ nhà thờ họ, banner, số người đã mất công khai, liên hệ đúng phạm vi", async () => {
    const res = await guest().get("/api/v1/public/site");
    expect(res.status).toBe(200);
    expect(res.body.clan).toMatchObject({ name: "Họ Ngô", surname: "Ngô" });
    expect(res.body.home).toMatchObject({ motto: "Uống nước nhớ nguồn", templeAddress: "Thôn Đông, xã An Hoà, huyện Hoài Nhơn" });
    expect(res.body.home.banners[0]).toMatchObject({ id: media.banner, caption: "Nhà thờ họ Ngô", urls: { lg: `/api/v1/public/media/${media.banner}/lg` } });
    expect(res.body.home.banners[0].urls.orig).toBeUndefined();
    expect(res.body.stats).toEqual({ people: 3, generations: 2 }); // Tổ, Bà, Mất
    expect(res.body.contacts).toEqual([
      { name: "Ngô Văn Trưởng", role: "Trưởng họ", phone: "+84912111222", email: null },
      { name: "Ngô Quản Trị", role: "Quản trị website", phone: "+84987000111", email: "quantri@example.com" },
      { name: "Ngô Văn Chi", role: "Trưởng chi 2", phone: null, email: null },
    ]);
  });

  it("phả đồ: chỉ người đã mất để công khai", async () => {
    const res = await guest().get("/api/v1/public/tree");
    expect(res.status).toBe(200);
    const names = res.body.nodes.map((n: { person: { fullName: string } }) => n.person.fullName).sort();
    expect(names).toEqual(["Lê Thị Bà", "Ngô Văn Mất", "Ngô Văn Tổ"]);
  });

  it("hồ sơ: người còn sống / không công khai → 404; người thân còn sống bị lược bỏ", async () => {
    expect((await guest().get(`/api/v1/public/persons/${id.song}`)).status).toBe(404);
    expect((await guest().get(`/api/v1/public/persons/${id.rieng}`)).status).toBe(404);
    const to = (await guest().get(`/api/v1/public/persons/${id.to}`)).body;
    expect(to.fullName).toBe("Ngô Văn Tổ");
    expect(to.unions[0].children.map((c: { fullName: string }) => c.fullName)).toEqual(["Ngô Văn Mất"]);
    expect(to.version).toBeUndefined();
    expect(to.privacy).toBeUndefined();
  });

  it("lịch giỗ: chỉ người công khai", async () => {
    const res = await guest().get("/api/v1/public/anniversaries");
    const names = res.body.items.map((i: { fullName: string }) => i.fullName).sort();
    expect(names).toEqual(["Ngô Văn Mất", "Ngô Văn Tổ"]);
  });

  it("ảnh: banner và chân dung người công khai xem được; ảnh người còn sống, ảnh khác, ảnh gốc thì không", async () => {
    const ok = await guest().get(`/api/v1/public/media/${media.banner}/md`);
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toContain("image/webp");
    expect(ok.headers["cache-control"]).toBe("public, max-age=86400");
    expect((await guest().get(`/api/v1/public/media/${media.anhTo}/sm`)).status).toBe(200);
    expect((await guest().get(`/api/v1/public/media/${media.anhSong}/sm`)).status).toBe(404);
    expect((await guest().get(`/api/v1/public/media/${media.khac}/sm`)).status).toBe(404);
    expect((await guest().get(`/api/v1/public/media/${media.banner}/orig`)).status).toBe(422);
  });

  it("đổi người đã mất sang 'Chỉ thành viên' → biến khỏi trang công khai ngay", async () => {
    const v = (await owner.get(url(`/persons/${id.mat}`))).body.version;
    await owner.patch(url(`/persons/${id.mat}`), { version: v, privacy: "members" });
    const names = (await guest().get("/api/v1/public/tree")).body.nodes.map((n: { person: { fullName: string } }) => n.person.fullName);
    expect(names).not.toContain("Ngô Văn Mất");
  });
});

describe("Chế độ nhiều dòng họ", () => {
  it("không có trang công khai chung → 404 NO_PUBLIC_SITE", async () => {
    const multi = await bootApp({ CLAN_MODE: "multi", MEDIA_DIR: mediaDir });
    const res = await request(multi.getHttpServer()).get("/api/v1/public/site");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NO_PUBLIC_SITE");
    await multi.close();
  });
});
