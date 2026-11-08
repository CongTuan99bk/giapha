import type { INestApplication } from "@nestjs/common";
import { statDateVN } from "@coinguon/schemas";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MailService } from "../src/mail/mail.service.js";
import { bootApp, Client, resetDatabase } from "./helpers.js";

// Thống kê lượt xem (gom trong bộ nhớ, ghi mỗi phút) và lời nhắn của khách từ trang công khai
let app: INestApplication;
let owner: Client;
let member: Client;
let clanId: string;
const url = (p: string) => `/clans/${clanId}${p}`;
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Zalo iOS";
const PC_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";

const track = (kind: "pv" | "hb", body: object, ua = PHONE_UA) => request(app.getHttpServer()).post(`/api/v1/t/${kind}`).set("User-Agent", ua).send(body);
const guestPost = (path: string, body: object) => request(app.getHttpServer()).post(`/api/v1${path}`).send(body);

beforeAll(async () => {
  await resetDatabase();
  app = await bootApp({ CLAN_MODE: "single" });
  owner = new Client(app);
  await owner.register("truong-ho@example.com", "Trưởng họ");
  clanId = (await owner.post("/clans", { name: "Họ Phan", slug: "ho-phan", surname: "Phan" })).body.id;
  const inv = await owner.post(url("/invitations"), { role: "member" });
  member = new Client(app);
  await member.register("tv@example.com", "Thành viên");
  await member.post(`/invitations/${inv.body.token}/accept`);
});
afterAll(async () => {
  await app.close();
});

describe("Thống kê lượt xem", () => {
  it("đếm lượt xem, khách duy nhất, thiết bị, nguồn; bỏ qua bot", async () => {
    const base = { h: "giapha.example.vn", v: "khach-mot-1234" };
    expect((await track("pv", { ...base, p: "/xem", r: "https://www.facebook.com/abc" })).status).toBe(204);
    expect((await track("pv", { ...base, p: "/xem/pha-do?nguoi=x" })).status).toBe(204);
    expect((await track("pv", { h: base.h, v: "khach-hai-5678", p: "/xem", m: 1 }, PC_UA)).status).toBe(204);
    // bot của Facebook lấy ảnh xem trước: không tính
    expect((await track("pv", { h: base.h, v: "bot-facebook-01", p: "/xem" }, "facebookexternalhit/1.1")).status).toBe(204);

    const today = statDateVN();
    const res = await owner.get(url(`/stats/daily?from=${today}&to=${today}`));
    expect(res.status).toBe(200);
    expect(res.body.days).toEqual([{ date: today, pageViews: 3, uniqueVisitors: 2, memberViews: 1 }]);
    expect(res.body.allTimeViews).toBe(3);
    expect(res.body.pages).toEqual(expect.arrayContaining([{ key: "/xem", views: 2 }, { key: "/xem/pha-do", views: 1 }]));
    expect(res.body.referrers).toEqual([{ key: "facebook.com", views: 1 }]);
    expect(res.body.devices).toEqual(expect.arrayContaining([{ key: "mobile", views: 2 }, { key: "desktop", views: 1 }]));
  });

  it("đang xem: khách và thành viên, theo trang", async () => {
    await track("hb", { h: "giapha.example.vn", v: "khach-ba-0000", p: "/xem/lich-gio" });
    const live = (await owner.get(url("/stats/live"))).body;
    expect(live).toMatchObject({ online: 3, guests: 2, members: 1 });
    expect(live.pages).toEqual(
      expect.arrayContaining([
        { path: "/xem/pha-do", online: 1 },
        { path: "/xem", online: 1 },
        { path: "/xem/lich-gio", online: 1 },
      ]),
    );
  });

  it("dữ liệu xấu → 422; thành viên thường không xem được thống kê", async () => {
    expect((await track("pv", { h: "x", v: "ngan", p: "/" })).status).toBe(422);
    expect((await member.get(url("/stats/live"))).status).toBe(403);
  });

  it("bộ đếm công khai ở chân trang", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/public/stats");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ online: 3, today: 3, total: 3 });
  });
});

describe("Lời nhắn của khách", () => {
  it("gửi lời nhắn → ban quản lý thấy, có email báo", async () => {
    const mail = app.get(MailService);
    mail.outbox.length = 0;
    const res = await guestPost("/public/messages", { name: "Phan Văn Khách", replyTo: "0912 345 678", message: "Xin hỏi ngày giỗ Tổ năm nay ạ" });
    expect(res.status).toBe(204);
    const list = (await owner.get(url("/messages"))).body;
    expect(list.open).toBe(1);
    expect(list.items[0]).toMatchObject({ name: "Phan Văn Khách", replyTo: "+84912345678", handledAt: null });
    expect(mail.outbox).toEqual([expect.objectContaining({ to: "truong-ho@example.com", subject: "Lời nhắn mới từ trang Họ Phan" })]);
  });

  it("ô bẫy có chữ (máy tự điền) → báo đã gửi nhưng không lưu", async () => {
    expect((await guestPost("/public/messages", { name: "Spam", replyTo: "a@b.vn", message: "mua ngay hôm nay", website: "http://spam" })).status).toBe(204);
    expect((await owner.get(url("/messages"))).body.items).toHaveLength(1);
  });

  it("thiếu cách liên lạc lại → 422 kèm chỉ dẫn", async () => {
    const res = await guestPost("/public/messages", { name: "Khách", replyTo: "abc", message: "Cho hỏi chút" });
    expect(res.status).toBe(422);
    expect(res.body.details).toEqual([expect.objectContaining({ path: "replyTo", message: "Số điện thoại hoặc email chưa đúng" })]);
  });

  it("đánh dấu đã xử lý, xoá; thành viên thường không xem được", async () => {
    const id = (await owner.get(url("/messages"))).body.items[0].id;
    expect((await member.get(url("/messages"))).status).toBe(403);
    const done = await owner.patch(url(`/messages/${id}`), { handled: true });
    expect(done.body.handledAt).not.toBeNull();
    expect((await owner.get(url("/messages?status=open"))).body).toEqual({ items: [], open: 0 });
    expect((await owner.delete(url(`/messages/${id}`))).status).toBe(204);
    expect((await owner.get(url("/messages"))).body.items).toHaveLength(0);
  });
});
