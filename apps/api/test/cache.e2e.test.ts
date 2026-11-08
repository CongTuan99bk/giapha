import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootApp, Client, resetDatabase } from "./helpers.js";

// Bộ nhớ đệm phả đồ / lịch giỗ / trang công khai: sửa xong thấy ngay, không đổi thì trả 304, phản hồi lớn được nén
let app: INestApplication;
let owner: Client;
let member: Client;
let clanId: string;
let rootId: string;

const guest = () => request(app.getHttpServer());
const url = (p: string) => `/clans/${clanId}${p}`;
const lunarDeath = (day: number, month: number, year: number) => ({ calendar: "lunar", precision: "day", year, month, day });
const names = (body: { nodes: Array<{ person: { fullName: string } }> }) => body.nodes.map((n) => n.person.fullName);

beforeAll(async () => {
  await resetDatabase();
  app = await bootApp({ CLAN_MODE: "single" });
  owner = new Client(app);
  await owner.register("truong-ho@example.com", "Trưởng họ");
  clanId = (await owner.post("/clans", { name: "Họ Đặng", slug: "ho-dang", surname: "Đặng" })).body.id;
  rootId = (await owner.post(url("/persons"), { fullName: "Đặng Văn Tổ", gender: "male", isLiving: false, deathDate: lunarDeath(2, 2, 1900) })).body.id;
  // đủ nhiều người để phản hồi vượt ngưỡng nén (1 KB)
  for (let i = 1; i <= 8; i++) {
    await owner.post(url(`/persons/${rootId}/children`), {
      person: { fullName: `Đặng Văn Con Thứ ${i}`, gender: "male", isLiving: false, deathDate: lunarDeath(i, i, 1950) },
    });
  }
  const inv = await owner.post(url("/invitations"), { role: "member" });
  member = new Client(app);
  await member.register("tv@example.com", "Thành viên");
  await member.post(`/invitations/${inv.body.token}/accept`);
});
afterAll(async () => {
  await app.close();
});

describe("Phả đồ thành viên", () => {
  it("lần sau gửi kèm ETag → 304 không có nội dung", async () => {
    const first = await member.get(url("/tree"));
    expect(first.status).toBe(200);
    expect(first.headers.etag).toMatch(/^"[\w-]+"$/);
    expect(first.headers["cache-control"]).toBe("private, no-cache");
    const again = await member.get(url("/tree")).set("If-None-Match", first.headers.etag!);
    expect(again.status).toBe(304);
    expect(again.text ?? "").toBe("");
  });

  it("phản hồi lớn được nén gzip / brotli", async () => {
    const gz = await member.get(url("/tree")).set("Accept-Encoding", "gzip");
    expect(gz.headers["content-encoding"]).toBe("gzip");
    expect(gz.body.nodes.length).toBe(9);
    const br = await member.get(url("/tree")).set("Accept-Encoding", "br, gzip").buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(br.headers["content-encoding"]).toBe("br");
  });

  it("thêm người → lần xem sau có ngay người mới (ETag khác)", async () => {
    const before = await member.get(url("/tree"));
    await owner.post(url(`/persons/${rootId}/children`), { person: { fullName: "Đặng Văn Út", gender: "male" } });
    const after = await member.get(url("/tree")).set("If-None-Match", before.headers.etag!);
    expect(after.status).toBe(200);
    expect(after.headers.etag).not.toBe(before.headers.etag);
    expect(names(after.body)).toContain("Đặng Văn Út");
  });

  it("người 'ẩn thông tin': thành viên thấy chữ ẩn, quản trị thấy tên — hai bản nhớ riêng", async () => {
    const id = (await owner.post(url(`/persons/${rootId}/children`), { person: { fullName: "Đặng Thị Kín", gender: "female", privacy: "hidden" } })).body.person.id;
    const asMember = (await member.get(url("/tree"))).body.nodes.find((n: { personId: string }) => n.personId === id);
    const asOwner = (await owner.get(url("/tree"))).body.nodes.find((n: { personId: string }) => n.personId === id);
    expect(asMember.person.fullName).toBe("Thông tin ẩn");
    expect(asOwner.person.fullName).toBe("Đặng Thị Kín");
  });

  it("lỗi không bị nhớ: gốc không tồn tại → 404 mỗi lần", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    expect((await member.get(url(`/tree?rootId=${missing}`))).status).toBe(404);
    expect((await member.get(url(`/tree?rootId=${missing}`))).status).toBe(404);
  });
});

describe("Lịch giỗ và trang công khai", () => {
  it("lịch giỗ thành viên cập nhật ngay khi sửa ngày mất", async () => {
    const before = (await member.get(url("/anniversaries"))).body.items.length;
    await owner.post(url(`/persons/${rootId}/children`), {
      person: { fullName: "Đặng Văn Mới Mất", gender: "male", isLiving: false, deathDate: lunarDeath(9, 9, 2020) },
    });
    expect((await member.get(url("/anniversaries"))).body.items.length).toBe(before + 1);
  });

  it("đổi tên dòng họ → trang chủ công khai đổi ngay", async () => {
    const etag = (await guest().get("/api/v1/public/site")).headers.etag!;
    expect((await guest().get("/api/v1/public/site").set("If-None-Match", etag)).status).toBe(304);
    const v = (await owner.get(url(""))).body.version;
    expect((await owner.patch(url(""), { name: "Họ Đặng làng Đông", ...(v === undefined ? {} : { version: v }) })).status).toBe(200);
    const res = await guest().get("/api/v1/public/site").set("If-None-Match", etag);
    expect(res.status).toBe(200);
    expect(res.body.clan.name).toBe("Họ Đặng làng Đông");
    expect(res.headers["cache-control"]).toBe("public, no-cache");
  });

  it("nhiều khách cùng lúc nhận cùng một kết quả", async () => {
    const all = await Promise.all(Array.from({ length: 8 }, () => guest().get("/api/v1/public/tree")));
    expect(new Set(all.map((r) => r.status))).toEqual(new Set([200]));
    expect(new Set(all.map((r) => r.headers.etag)).size).toBe(1);
    expect(names(all[0]!.body)).toContain("Đặng Văn Tổ");
    expect(names(all[0]!.body)).not.toContain("Đặng Văn Út"); // còn sống → không công khai
  });
});
