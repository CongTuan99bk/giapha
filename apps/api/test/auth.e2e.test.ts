import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootApp, Client, resetDatabase } from "./helpers.js";

let app: INestApplication;

beforeAll(async () => {
  await resetDatabase();
  app = await bootApp();
});
afterAll(async () => {
  await app.close();
});

describe("Xác thực", () => {
  it("health không cần đăng nhập", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("đăng ký → đặt cookie HttpOnly, /me trả về người dùng", async () => {
    const c = new Client(app);
    const agentRes = await c.agent
      .post("/api/v1/auth/register")
      .send({ email: "An@Example.com", password: "matkhau-an-toan", name: "Nguyễn An" });
    expect(agentRes.status).toBe(201);
    const cookies = ([] as string[]).concat(agentRes.headers["set-cookie"] ?? []);
    expect(cookies.find((x) => x.startsWith("sid="))).toMatch(/HttpOnly/);
    expect(cookies.find((x) => x.startsWith("csrf="))).not.toMatch(/HttpOnly/);
    expect(agentRes.body.user.email).toBe("an@example.com");

    const me = await c.get("/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("an@example.com");
  });

  it("email đã dùng → 409 EMAIL_TAKEN", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: "an@example.com", password: "matkhau-an-toan", name: "Khác" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");
  });

  it("dữ liệu sai → 422 VALIDATION_FAILED", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: "khong-phai-email", password: "123", name: "" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  it("chưa đăng nhập → 401", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/me");
    expect(res.status).toBe(401);
  });

  it("thiếu header CSRF ở request ghi → 403", async () => {
    const c = new Client(app);
    await c.register("csrf@example.com");
    const res = await c.agent.post("/api/v1/clans").send({ name: "Họ Lê", slug: "ho-le", surname: "Lê" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_INVALID");
  });

  it("sai mật khẩu 5 lần → khoá 423, kể cả khi nhập đúng sau đó", async () => {
    const c = new Client(app);
    await c.register("lock@example.com");
    const server = request(app.getHttpServer());
    for (let i = 1; i <= 5; i++) {
      const r = await server.post("/api/v1/auth/login").send({ email: "lock@example.com", password: "sai-mat-khau" });
      expect(r.status).toBe(i < 5 ? 401 : 423); // lần sai thứ 5 khoá ngay
    }
    const locked = await server.post("/api/v1/auth/login").send({ email: "lock@example.com", password: "matkhau-an-toan" });
    expect(locked.status).toBe(423);
    expect(locked.body.code).toBe("ACCOUNT_LOCKED");
  });

  it("đăng nhập đúng rồi đăng xuất → phiên hết hiệu lực", async () => {
    const c = new Client(app);
    await c.register("out@example.com");
    const login = await c.agent.post("/api/v1/auth/login").send({ email: "out@example.com", password: "matkhau-an-toan" });
    expect(login.status).toBe(200);
    c.csrf = login.body.csrfToken;
    expect((await c.post("/auth/logout")).status).toBe(204);
    expect((await c.get("/me")).status).toBe(401);
  });
});
