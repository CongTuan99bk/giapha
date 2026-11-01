import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootApp, Client, resetDatabase } from "./helpers.js";

let app: INestApplication;

beforeAll(async () => {
  await resetDatabase();
  app = await bootApp({ CLAN_MODE: "single" });
});
afterAll(async () => {
  await app.close();
});

describe("Chế độ một dòng họ (CLAN_MODE=single)", () => {
  it("chưa có dòng họ → instance.clan = null", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/instance");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ clanMode: "single", clan: null });
  });

  it("tạo được dòng họ đầu tiên, dòng họ thứ hai bị chặn", async () => {
    const first = new Client(app);
    await first.register("chu@example.com");
    const ok = await first.post("/clans", { name: "Họ Phan Văn", slug: "phan-van", surname: "Phan" });
    expect(ok.status).toBe(201);

    const second = new Client(app);
    await second.register("khac@example.com");
    const blocked = await second.post("/clans", { name: "Họ Khác", slug: "ho-khac", surname: "Lê" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("SINGLE_CLAN_EXISTS");

    const inst = await request(app.getHttpServer()).get("/api/v1/instance");
    expect(inst.body.clan).toMatchObject({ id: ok.body.id, name: "Họ Phan Văn", slug: "phan-van" });
  });
});
