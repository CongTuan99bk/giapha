import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootApp, Client, resetDatabase } from "./helpers.js";

// Ngày giỗ ghi riêng (không rõ ngày mất) qua form người — khớp với cột "Ngày giỗ (âm lịch)" khi nhập Excel
let app: INestApplication;
let owner: Client;
let clanId: string;
let id: string;
const url = (p: string) => `/clans/${clanId}${p}`;
const detail = async () => (await owner.get(url(`/persons/${id}`))).body;
const patch = async (body: object) => owner.patch(url(`/persons/${id}`), { version: (await detail()).version, ...body });

beforeAll(async () => {
  await resetDatabase();
  app = await bootApp();
  owner = new Client(app);
  await owner.register("truong-ho@example.com", "Trưởng họ");
  clanId = (await owner.post("/clans", { name: "Họ Đỗ", slug: "ho-do", surname: "Đỗ" })).body.id;
});
afterAll(async () => {
  await app.close();
});

describe("Ngày giỗ ghi riêng", () => {
  it("người đã mất không rõ ngày mất: lưu ngày giỗ, có trong lịch giỗ", async () => {
    const res = await owner.post(url("/persons"), { fullName: "Đỗ Văn Cụ", gender: "male", isLiving: false, deathAnniversaryLunar: { day: 12, month: 3 } });
    expect(res.status).toBe(201);
    id = res.body.id;
    expect(res.body.deathAnniversaryLunar).toEqual({ day: 12, month: 3, isLeapMonth: false });
    const items = (await owner.get(url("/anniversaries?days=400"))).body.items;
    expect(items).toEqual([expect.objectContaining({ fullName: "Đỗ Văn Cụ", lunar: expect.objectContaining({ day: 12, month: 3 }), nth: null })]);
  });

  it("sửa trường khác: ngày giỗ ghi riêng được giữ", async () => {
    expect((await patch({ fullName: "Đỗ Văn Cụ Tổ" })).status).toBe(200);
    expect((await detail()).deathAnniversaryLunar).toEqual({ day: 12, month: 3, isLeapMonth: false });
  });

  it("có ngày mất đủ ngày tháng: ngày giỗ luôn tính từ ngày mất, giá trị ghi riêng bị bỏ qua", async () => {
    const res = await patch({
      deathDate: { calendar: "lunar", precision: "day", year: 1950, month: 4, day: 5 },
      deathAnniversaryLunar: { day: 20, month: 8 },
    });
    expect(res.body.deathAnniversaryLunar).toEqual({ day: 5, month: 4, isLeapMonth: false });
  });

  it("đổi ngày mất về chỉ có năm: ngày giỗ tự tính cũ không còn, ghi riêng ngày mới được", async () => {
    let res = await patch({ deathDate: { calendar: "solar", precision: "year", year: 1950 } });
    expect(res.body.deathAnniversaryLunar).toBeNull();
    res = await patch({ deathAnniversaryLunar: { day: 20, month: 8, isLeapMonth: true } });
    expect(res.body.deathAnniversaryLunar).toEqual({ day: 20, month: 8, isLeapMonth: true });
    // xoá ngày giỗ
    res = await patch({ deathAnniversaryLunar: null });
    expect(res.body.deathAnniversaryLunar).toBeNull();
  });

  it("người còn sống không có ngày giỗ", async () => {
    const created = await owner.post(url("/persons"), { fullName: "Đỗ Văn Sống", isLiving: true, deathAnniversaryLunar: { day: 1, month: 1 } });
    expect(created.status).toBe(422);
    expect(created.body.details).toEqual([expect.objectContaining({ path: "deathAnniversaryLunar", message: "Người còn sống không có ngày giỗ" })]);
    await patch({ deathAnniversaryLunar: { day: 9, month: 9 } });
    const bad = await patch({ isLiving: true, deathDate: null, deathAnniversaryLunar: { day: 9, month: 9 } });
    expect(bad.status).toBe(422);
    // chuyển sang còn sống (nhập nhầm): ngày giỗ tự xoá
    const ok = await patch({ isLiving: true, deathDate: null });
    expect(ok.body.deathAnniversaryLunar).toBeNull();
  });

  it("ngày giỗ sai → 422 kèm chỉ dẫn", async () => {
    const res = await owner.post(url("/persons"), { fullName: "Đỗ Thị Sai", isLiving: false, deathAnniversaryLunar: { day: 31, month: 3 } });
    expect(res.status).toBe(422);
    expect(res.body.details).toEqual([expect.objectContaining({ path: "deathAnniversaryLunar.day", message: "Ngày âm lịch từ 1 đến 30" })]);
  });
});
