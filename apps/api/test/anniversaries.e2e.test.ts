import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayInVietnam, toIcs, upcomingAnniversaries, type AnniversarySource } from "../src/anniversaries/upcoming.js";
import { bootApp, Client, resetDatabase } from "./helpers.js";

const base: Omit<AnniversarySource, "id" | "fullName" | "anniv" | "deathLunarYear"> = {
  gender: "male",
  generation: 1,
  inClan: true,
  deathYear: null,
};

describe("Tính ngày giỗ", () => {
  it("mất mùng 1 Tết → giỗ 6/2/2027 (Thứ bảy), giỗ lần thứ 37, còn 96 ngày", () => {
    const [a] = upcomingAnniversaries([{ ...base, id: "a", fullName: "Cụ Tết", anniv: { day: 1, month: 1 }, deathLunarYear: 1990 }], {
      from: { year: 2026, month: 11, day: 2 },
      days: 365,
      day30Rule: "day29",
    });
    expect(a).toMatchObject({ solarDate: "2027-02-06", weekday: 6, daysUntil: 96, nth: 37, lunar: { day: 1, month: 1, year: 2027 } });
  });

  it("giỗ đầu / giỗ hết theo năm âm lịch; sắp xếp theo ngày; khoảng dài có hai lần giỗ", () => {
    const list = upcomingAnniversaries(
      [
        { ...base, id: "b", fullName: "Bà Hai", anniv: { day: 15, month: 8 }, deathLunarYear: 2025 },
        { ...base, id: "c", fullName: "Ông Ba", anniv: { day: 1, month: 1 }, deathLunarYear: 2026 },
      ],
      { from: { year: 2026, month: 11, day: 2 }, days: 730, day30Rule: "day29" },
    );
    expect(list.map((x) => [x.fullName, x.nth])).toEqual([
      ["Ông Ba", 1], // Tết 2027: giỗ đầu
      ["Bà Hai", 2], // Rằm tháng 8 năm 2027: giỗ hết
      ["Ông Ba", 2],
      ["Bà Hai", 3],
    ]);
  });

  it("mất tháng nhuận → giỗ tháng thường; dữ liệu hỏng thì bỏ qua người đó", () => {
    const list = upcomingAnniversaries(
      [
        { ...base, id: "d", fullName: "Nhuận", anniv: { day: 10, month: 6, isLeapMonth: true }, deathLunarYear: null },
        { ...base, id: "e", fullName: "Hỏng", anniv: { day: 40, month: 13 }, deathLunarYear: null },
      ],
      { from: { year: 2026, month: 11, day: 2 }, days: 365, day30Rule: "day29" },
    );
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ fullName: "Nhuận", nth: null, lunar: { month: 6, isLeapMonth: false } });
    expect(list[0]!.adjustments).toContain("leap-month-to-regular");
  });

  it("hôm nay theo giờ Việt Nam (23:30 UTC đã là ngày hôm sau ở Việt Nam)", () => {
    expect(todayInVietnam(new Date("2026-11-02T23:30:00Z"))).toEqual({ year: 2026, month: 11, day: 3 });
  });

  it("file .ics: sự kiện cả ngày, nhắc trước 3 ngày, dòng dài được gập đúng chuẩn", () => {
    const [a] = upcomingAnniversaries([{ ...base, id: "a", fullName: "Cụ Phan Văn Mẫu có tên rất dài để thử gập dòng", anniv: { day: 1, month: 1 }, deathLunarYear: 1990 }], {
      from: { year: 2026, month: 11, day: 2 },
      days: 365,
      day30Rule: "day29",
    });
    const ics = toIcs([a!], "Họ Phan, làng Mẫu", new Date("2026-11-02T00:00:00Z"));
    expect(ics).toContain("DTSTART;VALUE=DATE:20270206\r\nDTEND;VALUE=DATE:20270207");
    expect(ics).toContain("TRIGGER:-P3D");
    expect(ics).toContain("X-WR-CALNAME:Lịch giỗ Họ Phan\\, làng Mẫu");
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    // ghép các dòng gập lại thì ra đúng nội dung
    expect(ics.replace(/\r\n /g, "")).toContain("SUMMARY:Giỗ Cụ Phan Văn Mẫu có tên rất dài để thử gập dòng (1/1 âm lịch)");
  });
});

describe("API lịch giỗ", () => {
  let app: INestApplication;
  let owner: Client;
  let member: Client;
  let clanId: string;

  beforeAll(async () => {
    await resetDatabase();
    app = await bootApp();
    owner = new Client(app);
    await owner.register("owner@example.com", "Chủ họ");
    clanId = (await owner.post("/clans", { name: "Họ Võ", slug: "ho-vo", surname: "Võ" })).body.id;
    const add = (body: object) => owner.post(`/clans/${clanId}/persons`, body);
    await add({
      fullName: "Võ Văn Tổ",
      gender: "male",
      isLiving: false,
      deathDate: { calendar: "lunar", precision: "day", year: 1926, month: 3, day: 12 },
    });
    // ngày mất ghi dương lịch → tự đổi sang âm lịch để tính giỗ
    await add({
      fullName: "Võ Thị Dương",
      gender: "female",
      isLiving: false,
      deathDate: { calendar: "solar", precision: "day", year: 2020, month: 5, day: 1 },
    });
    await add({ fullName: "Võ Văn Ẩn", gender: "male", isLiving: false, privacy: "hidden", deathDate: { calendar: "lunar", precision: "day", year: 1950, month: 7, day: 2 } });
    await add({ fullName: "Võ Văn Chưa Rõ", gender: "male", isLiving: false, deathDate: { calendar: "solar", precision: "year", year: 1960 } });
    await add({ fullName: "Võ Văn Sống", gender: "male", isLiving: true });

    const inv = await owner.post(`/clans/${clanId}/invitations`, { role: "member" });
    member = new Client(app);
    await member.register("member@example.com", "Thành viên");
    await member.post(`/invitations/${inv.body.token}/accept`);
  });
  afterAll(async () => {
    await app.close();
  });

  it("liệt kê giỗ trong năm tới theo thứ tự ngày, kèm số người chưa đủ ngày mất", async () => {
    const res = await owner.get(`/clans/${clanId}/anniversaries?from=2026-11-02&days=365`);
    expect(res.status).toBe(200);
    expect(res.body.from).toBe("2026-11-02");
    expect(res.body.missingDeathDay).toBe(1);
    const names = res.body.items.map((i: { fullName: string }) => i.fullName);
    expect(names).toEqual(expect.arrayContaining(["Võ Văn Tổ", "Võ Thị Dương", "Võ Văn Ẩn"]));
    expect(names).not.toContain("Võ Văn Sống");
    const days = res.body.items.map((i: { daysUntil: number }) => i.daysUntil);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
    const to = res.body.items.find((i: { fullName: string }) => i.fullName === "Võ Văn Tổ");
    expect(to).toMatchObject({ lunar: { day: 12, month: 3, year: 2027 }, nth: 101, deathYear: 1926 });
  });

  it("thành viên thường không thấy người bị ẩn thông tin", async () => {
    const res = await member.get(`/clans/${clanId}/anniversaries?from=2026-11-02`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { fullName: string }) => i.fullName)).not.toContain("Võ Văn Ẩn");
  });

  it("tải file .ics", async () => {
    const res = await member.get(`/clans/${clanId}/anniversaries.ics?years=1`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/calendar");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="lich-gio-ho-vo.ics"');
    expect(res.text).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(res.text).toContain("SUMMARY:Giỗ Võ Văn Tổ (12/3 âm lịch)");
  });

  it("tham số sai → 422", async () => {
    expect((await owner.get(`/clans/${clanId}/anniversaries?from=02-11-2026`)).status).toBe(422);
    expect((await owner.get(`/clans/${clanId}/anniversaries?days=5000`)).status).toBe(422);
  });
});
