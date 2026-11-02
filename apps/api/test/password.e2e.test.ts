import type { INestApplication } from "@nestjs/common";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MailService } from "../src/mail/mail.service.js";
import { bootApp, Client, OWNER_URL, resetDatabase } from "./helpers.js";

let app: INestApplication;
let outbox: MailService["outbox"];

const tokenFrom = (text: string) => /\/dat-lai-mat-khau\?ma=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? "";
const forgot = (email: string) => request(app.getHttpServer()).post("/api/v1/auth/forgot-password").send({ email });
const reset = (token: string, password: string) => request(app.getHttpServer()).post("/api/v1/auth/reset-password").send({ token, password });
const login = (email: string, password: string) => request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password });

async function sql(q: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: OWNER_URL });
  await c.connect();
  try {
    return await c.query(q, params);
  } finally {
    await c.end();
  }
}

beforeAll(async () => {
  await resetDatabase();
  app = await bootApp({ PUBLIC_URL: "https://giapha.example.vn" });
  outbox = app.get(MailService).outbox;
});
afterAll(async () => {
  await app.close();
});

describe("Quên mật khẩu qua email", () => {
  it("email không có tài khoản: vẫn trả 202 như thường, không gửi gì (không cho dò email)", async () => {
    const res = await forgot("khong-ai@example.com");
    expect(res.status).toBe(202);
    expect(outbox).toHaveLength(0);
  });

  it("gửi link tuyệt đối theo PUBLIC_URL; đặt lại xong: mật khẩu mới dùng được, đăng xuất mọi thiết bị, link không dùng lại được", async () => {
    const c = new Client(app);
    await c.register("quen@example.com", "Người hay quên");
    expect((await c.get("/me")).status).toBe(200);

    expect((await forgot("Quen@Example.com")).status).toBe(202);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.to).toBe("quen@example.com");
    expect(outbox[0]!.text).toContain("https://giapha.example.vn/dat-lai-mat-khau?ma=");
    const token = tokenFrom(outbox[0]!.text);

    const ok = await reset(token, "mat-khau-moi-123");
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ email: "quen@example.com" });

    expect((await c.get("/me")).status).toBe(401); // phiên cũ bị huỷ
    expect((await login("quen@example.com", "matkhau-an-toan")).status).toBe(401);
    expect((await login("quen@example.com", "mat-khau-moi-123")).status).toBe(200);

    const again = await reset(token, "mat-khau-khac-456");
    expect(again.status).toBe(410);
    expect(again.body.code).toBe("RESET_LINK_INVALID");
  });

  it("chỉ link mới nhất dùng được; link hết hạn bị từ chối", async () => {
    outbox.length = 0;
    await forgot("quen@example.com");
    await forgot("quen@example.com");
    const [first, second] = outbox.map((m) => tokenFrom(m.text));
    expect((await reset(first!, "mat-khau-moi-789")).status).toBe(410);

    await sql("update password_resets set expires_at = now() - interval '1 minute' where used_at is null");
    expect((await reset(second!, "mat-khau-moi-789")).status).toBe(410);
  });

  it("đặt lại mật khẩu mở khoá tài khoản đang bị khoá vì nhập sai", async () => {
    for (let i = 0; i < 5; i++) await login("quen@example.com", "sai-mat-khau");
    expect((await login("quen@example.com", "mat-khau-moi-123")).status).toBe(423);
    outbox.length = 0;
    await forgot("quen@example.com");
    expect((await reset(tokenFrom(outbox[0]!.text), "mo-khoa-roi-123")).status).toBe(200);
    expect((await login("quen@example.com", "mo-khoa-roi-123")).status).toBe(200);
  });

  it("mật khẩu mới quá ngắn hoặc mã sai định dạng → 422", async () => {
    expect((await reset("abc", "mat-khau-du-dai")).status).toBe(422);
    expect((await reset("A".repeat(43), "ngan")).status).toBe(422);
  });
});

describe("Quản trị tạo link đặt lại mật khẩu hộ thành viên", () => {
  it("chủ họ tạo link cho thành viên (gửi qua Zalo); thành viên dùng link đặt mật khẩu mới", async () => {
    const owner = new Client(app);
    await owner.register("truong-ho@example.com", "Trưởng họ");
    const clanId = (await owner.post("/clans", { name: "Họ Hồ", slug: "ho-ho", surname: "Hồ" })).body.id;
    const inv = await owner.post(`/clans/${clanId}/invitations`, { role: "editor" });
    const member = new Client(app);
    await member.register("ong-bay@example.com", "Ông Bảy");
    await member.post(`/invitations/${inv.body.token}/accept`);
    const members = (await owner.get(`/clans/${clanId}/members`)).body as Array<{ id: string; email: string }>;
    const bay = members.find((m) => m.email === "ong-bay@example.com")!;
    const self = members.find((m) => m.email === "truong-ho@example.com")!;

    const link = await owner.post(`/clans/${clanId}/members/${bay.id}/password-reset`);
    expect(link.status).toBe(201);
    expect(link.body.path).toMatch(/^\/dat-lai-mat-khau\?ma=/);
    expect(new Date(link.body.expiresAt).getTime() - Date.now()).toBeGreaterThan(23 * 3_600_000);

    expect((await reset(tokenFrom(link.body.path), "ong-bay-moi-123")).status).toBe(200);
    expect((await login("ong-bay@example.com", "ong-bay-moi-123")).status).toBe(200);

    const own = await owner.post(`/clans/${clanId}/members/${self.id}/password-reset`);
    expect(own.status).toBe(403);
    expect(own.body.code).toBe("USE_FORGOT_PASSWORD");
    // người nhập liệu không tạo được link cho ai
    const relog = await member.agent.post("/api/v1/auth/login").send({ email: "ong-bay@example.com", password: "ong-bay-moi-123" });
    member.csrf = relog.body.csrfToken;
    expect((await member.post(`/clans/${clanId}/members/${self.id}/password-reset`)).status).toBe(403);
  });
});

describe("Giới hạn tần suất (chặn dò mật khẩu, spam)", () => {
  let limited: INestApplication;
  beforeAll(async () => {
    limited = await bootApp({ RATE_LIMIT: "on", CLIENT_IP_HEADER: "cf-connecting-ip" });
  });
  afterAll(async () => {
    await limited.close();
  });

  const forgotFrom = (ip: string, email: string) =>
    request(limited.getHttpServer()).post("/api/v1/auth/forgot-password").set("CF-Connecting-IP", ip).send({ email });

  it("quá 3 lần/giờ cho cùng một email → 429 kèm Retry-After, câu báo dễ hiểu", async () => {
    for (let i = 0; i < 3; i++) expect((await forgotFrom(`10.9.0.${i}`, "mot-email@example.com")).status).toBe(202);
    const blocked = await forgotFrom("10.9.0.99", "mot-email@example.com");
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("TOO_MANY_REQUESTS");
    expect(blocked.body.message).toMatch(/thử lại sau \d+ phút/);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("quá 5 lần/giờ từ cùng một IP → 429; IP khác vẫn dùng bình thường", async () => {
    for (let i = 0; i < 5; i++) expect((await forgotFrom("203.0.113.7", `nguoi${i}@example.com`)).status).toBe(202);
    expect((await forgotFrom("203.0.113.7", "nguoi-6@example.com")).status).toBe(429);
    expect((await forgotFrom("198.51.100.1", "nguoi-6@example.com")).status).toBe(202);
  });
});
