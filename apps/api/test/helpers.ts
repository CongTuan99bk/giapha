import type { INestApplication } from "@nestjs/common";
import pg from "pg";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

// Database riêng cho test API (coinguon_test_api) để không đụng test RLS của packages/db khi turbo chạy song song.
const OWNER_URL = process.env.TEST_API_DATABASE_URL ?? "postgresql://coinguon:coinguon@localhost:5432/coinguon_test_api";
const APP_URL =
  process.env.TEST_API_APP_DATABASE_URL ?? "postgresql://coinguon_app:coinguon_app@localhost:5432/coinguon_test_api";
const PLATFORM_URL =
  process.env.TEST_API_PLATFORM_DATABASE_URL ??
  "postgresql://coinguon_platform:coinguon_platform@localhost:5432/coinguon_test_api";

/** Xoá sạch dữ liệu giữa các file test (dùng role chủ sở hữu, không bị RLS). */
export async function resetDatabase(): Promise<void> {
  const client = new pg.Client({ connectionString: OWNER_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'",
    );
    await client.query(`truncate ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`);
  } finally {
    await client.end();
  }
}

export async function bootApp(): Promise<INestApplication> {
  const config = loadConfig({
    NODE_ENV: "test",
    APP_DATABASE_URL: APP_URL,
    PLATFORM_DATABASE_URL: PLATFORM_URL,
  });
  const app = await createApp(config);
  await app.init();
  return app;
}

/** Phiên trình duyệt giả lập: giữ cookie và tự gửi header CSRF. */
export class Client {
  readonly agent: ReturnType<typeof request.agent>;
  csrf = "";

  constructor(app: INestApplication) {
    this.agent = request.agent(app.getHttpServer());
  }

  async register(email: string, name = "Người dùng") {
    const res = await this.agent.post("/api/v1/auth/register").send({ email, password: "matkhau-an-toan", name });
    if (res.status !== 201) throw new Error(`register ${res.status}: ${JSON.stringify(res.body)}`);
    this.csrf = res.body.csrfToken;
    return res.body.user as { id: string; email: string };
  }

  get(url: string) {
    return this.agent.get(`/api/v1${url}`);
  }
  post(url: string, body?: object) {
    return this.agent.post(`/api/v1${url}`).set("X-CSRF-Token", this.csrf).send(body ?? {});
  }
  patch(url: string, body: object) {
    return this.agent.patch(`/api/v1${url}`).set("X-CSRF-Token", this.csrf).send(body);
  }
  put(url: string, body: object) {
    return this.agent.put(`/api/v1${url}`).set("X-CSRF-Token", this.csrf).send(body);
  }
  delete(url: string) {
    return this.agent.delete(`/api/v1${url}`).set("X-CSRF-Token", this.csrf);
  }
}
