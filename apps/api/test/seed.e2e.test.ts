import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { seed } from "../src/seed.js";
import { APP_URL, OWNER_URL, PLATFORM_URL, resetDatabase } from "./helpers.js";

beforeAll(async () => {
  await resetDatabase();
  process.env.APP_DATABASE_URL = APP_URL;
  process.env.PLATFORM_DATABASE_URL = PLATFORM_URL;
  process.env.NODE_ENV = "test";
});

describe("Dữ liệu mẫu (seed)", () => {
  it("tạo cây 6 đời hợp lệ, chạy lại thì từ chối", async () => {
    const r = await seed({ email: "seed@example.com", password: "matkhau-an-toan" });
    expect(r.personCount).toBeGreaterThan(30);

    const client = new pg.Client({ connectionString: OWNER_URL });
    await client.connect();
    try {
      const { rows } = await client.query<{ max: number; roots: string }>(
        "select max(generation) as max, (select count(*) from clans where root_person_id is not null) as roots from persons",
      );
      expect(rows[0]!.max).toBe(6);
      expect(Number(rows[0]!.roots)).toBe(1);
      const living = await client.query("select count(*)::int as n from persons where is_living");
      expect(living.rows[0].n).toBeGreaterThan(5);
    } finally {
      await client.end();
    }

    await expect(seed({ email: "x@example.com", password: "matkhau-an-toan" })).rejects.toThrow(/đã có dòng họ/);
  });
});
