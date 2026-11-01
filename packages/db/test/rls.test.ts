/**
 * Kiểm thử tích hợp với PostgreSQL thật: phân tách dòng họ (TC-SEC-01), toàn vẹn phả hệ, tìm kiếm.
 *
 * Cần database đã chạy migration + infra/docker/postgres/init.sql. Bỏ qua nếu thiếu biến môi trường:
 *   TEST_DATABASE_URL           — role chủ (coinguon) để chuẩn bị dữ liệu
 *   TEST_APP_DATABASE_URL       — role coinguon_app (bị RLS giới hạn)
 *   TEST_PLATFORM_DATABASE_URL  — role coinguon_platform (BYPASSRLS)
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const OWNER_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const PLATFORM_URL = process.env.TEST_PLATFORM_DATABASE_URL;
const enabled = Boolean(OWNER_URL && APP_URL && PLATFORM_URL);

const clanA = randomUUID();
const clanB = randomUUID();
const ids = {
  a1: randomUUID(), // thuỷ tổ họ A
  a1w: randomUUID(),
  a2: randomUUID(), // con
  a3: randomUUID(), // cháu
  b1: randomUUID(),
  uA: randomUUID(),
  uA2: randomUUID(),
};

let owner: pg.Client;
let app: pg.Client;
let platform: pg.Client;

/** Chạy `fn` trong transaction với ngữ cảnh dòng họ, luôn rollback — mô phỏng một request. */
async function asClan<T>(client: pg.Client, clanId: string | null, fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    if (clanId) await client.query("SELECT set_config('app.clan_id', $1, true)", [clanId]);
    return await fn();
  } finally {
    await client.query("ROLLBACK");
  }
}

async function errorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-error";
  } catch (e) {
    return (e as Error).message.split(":")[0]!;
  }
}

describe.skipIf(!enabled)("PostgreSQL: RLS, toàn vẹn, tìm kiếm", () => {
  beforeAll(async () => {
    owner = new pg.Client({ connectionString: OWNER_URL });
    app = new pg.Client({ connectionString: APP_URL });
    platform = new pg.Client({ connectionString: PLATFORM_URL });
    await Promise.all([owner.connect(), app.connect(), platform.connect()]);

    await owner.query(
      `INSERT INTO clans (id, name, slug, surname, updated_at) VALUES
       ($1, 'Họ Nguyễn', $3, 'Nguyễn', now()), ($2, 'Họ Trần', $4, 'Trần', now())`,
      [clanA, clanB, `test-a-${clanA.slice(0, 8)}`, `test-b-${clanB.slice(0, 8)}`],
    );
    const insertPerson = (clan: string, id: string, name: string, gender: string, path: string | null, year: number | null) =>
      owner.query(
        `INSERT INTO persons (id, clan_id, full_name, gender, lineage_path, birth_date, updated_at)
         VALUES ($1, $2, $3, $4::"Gender", $5::ltree, $6::jsonb, now())`,
        [id, clan, name, gender, path, year ? JSON.stringify({ calendar: "solar", precision: "year", year }) : null],
      );
    // role chủ cũng bị FORCE RLS → đặt ngữ cảnh khi chuẩn bị dữ liệu
    await owner.query("SELECT set_config('app.clan_id', $1, false)", [clanA]);
    await insertPerson(clanA, ids.a1, "Nguyễn Văn Đức", "male", "1", 1880);
    await insertPerson(clanA, ids.a1w, "Lê Thị Hoa", "female", null, 1885);
    await insertPerson(clanA, ids.a2, "Nguyễn Văn Bình", "male", "1.1", 1910);
    await insertPerson(clanA, ids.a3, "Nguyễn Thị Cúc", "female", "1.1.1", 1940);
    await owner.query(
      `INSERT INTO unions (id, clan_id, partner_a_id, partner_b_id) VALUES ($1, $2, $3, $4), ($5, $2, $6, NULL)`,
      [ids.uA, clanA, ids.a1, ids.a1w, ids.uA2, ids.a2],
    );
    await owner.query(
      `INSERT INTO parent_child (clan_id, union_id, child_id, birth_order) VALUES ($1, $2, $3, 1), ($1, $4, $5, 1)`,
      [clanA, ids.uA, ids.a2, ids.uA2, ids.a3],
    );
    await owner.query("SELECT set_config('app.clan_id', $1, false)", [clanB]);
    await insertPerson(clanB, ids.b1, "Trần Văn An", "male", "1", 1900);
    await owner.query("SELECT set_config('app.clan_id', '', false)");
  });

  afterAll(async () => {
    if (!owner) return;
    await platform.query("DELETE FROM clans WHERE id = ANY($1)", [[clanA, clanB]]);
    await Promise.all([owner.end(), app.end(), platform.end()]);
  });

  describe("Phân tách dòng họ (TC-SEC-01)", () => {
    it("chưa đặt dòng họ → không thấy gì", async () => {
      const r = await asClan(app, null, () => app.query("SELECT id FROM persons WHERE id = ANY($1)", [Object.values(ids)]));
      expect(r.rowCount).toBe(0);
    });

    it("chỉ thấy người của dòng họ mình", async () => {
      const r = await asClan(app, clanA, () => app.query("SELECT id FROM persons WHERE clan_id = ANY($1)", [[clanA, clanB]]));
      expect(r.rows.map((x) => x.id).sort()).toEqual([ids.a1, ids.a1w, ids.a2, ids.a3].sort());
      const b = await asClan(app, clanB, () => app.query("SELECT id FROM persons WHERE id = $1", [ids.a1]));
      expect(b.rowCount).toBe(0);
    });

    it("không ghi được dữ liệu vào dòng họ khác", async () => {
      const code = await errorCode(
        asClan(app, clanA, () =>
          app.query(`INSERT INTO persons (id, clan_id, full_name, updated_at) VALUES ($1, $2, 'X', now())`, [randomUUID(), clanB]),
        ),
      );
      expect(code).toMatch(/row-level security/);
    });

    it("không sửa/xoá được dữ liệu dòng họ khác (0 dòng bị ảnh hưởng)", async () => {
      const r = await asClan(app, clanB, () => app.query(`UPDATE persons SET full_name = 'hack' WHERE id = $1`, [ids.a1]));
      expect(r.rowCount).toBe(0);
      const d = await asClan(app, clanB, () => app.query(`DELETE FROM persons WHERE id = $1`, [ids.a1]));
      expect(d.rowCount).toBe(0);
    });

    it("role nền tảng (BYPASSRLS) thấy mọi dòng họ — dùng cho worker tổng hợp", async () => {
      const r = await platform.query("SELECT count(*)::int AS n FROM persons WHERE clan_id = ANY($1)", [[clanA, clanB]]);
      expect(r.rows[0].n).toBe(5);
    });
  });

  describe("Toàn vẹn phả hệ (BR-TREE-02)", () => {
    it("chặn vòng lặp tổ tiên: gắn thuỷ tổ làm con của cháu", async () => {
      const code = await errorCode(
        asClan(app, clanA, async () => {
          const u = randomUUID();
          await app.query(`INSERT INTO unions (id, clan_id, partner_a_id) VALUES ($1, $2, $3)`, [u, clanA, ids.a3]);
          await app.query(`INSERT INTO parent_child (clan_id, union_id, child_id, birth_order) VALUES ($1, $2, $3, 1)`, [clanA, u, ids.a1]);
        }),
      );
      expect(code).toBe("ANCESTOR_CYCLE");
    });

    it("chặn tự làm cha mẹ của mình", async () => {
      const code = await errorCode(
        asClan(app, clanA, () =>
          app.query(`INSERT INTO parent_child (clan_id, union_id, child_id, birth_order) VALUES ($1, $2, $3, 2)`, [clanA, ids.uA, ids.a1]),
        ),
      );
      expect(code).toBe("SELF_PARENT");
    });

    it("chặn hôn phối với chính mình và thứ tự con trùng", async () => {
      expect(
        await errorCode(
          asClan(app, clanA, () =>
            app.query(`INSERT INTO unions (id, clan_id, partner_a_id, partner_b_id) VALUES ($1, $2, $3, $3)`, [randomUUID(), clanA, ids.a2]),
          ),
        ),
      ).toMatch(/unions_distinct_partners_chk/);
      expect(
        await errorCode(
          asClan(app, clanA, async () => {
            const p = randomUUID();
            await app.query(`INSERT INTO persons (id, clan_id, full_name, updated_at) VALUES ($1, $2, 'Con 2', now())`, [p, clanA]);
            await app.query(`INSERT INTO parent_child (clan_id, union_id, child_id, birth_order) VALUES ($1, $2, $3, 1)`, [clanA, ids.uA, p]);
          }),
        ),
      ).toMatch(/duplicate key/);
    });

    it("role nền tảng cũng không nối được người giữa hai dòng họ", async () => {
      const code = await errorCode(
        (async () => {
          await platform.query("BEGIN");
          try {
            await platform.query(`INSERT INTO unions (id, clan_id, partner_a_id, partner_b_id) VALUES ($1, $2, $3, $4)`, [
              randomUUID(),
              clanA,
              ids.a2,
              ids.b1,
            ]);
          } finally {
            await platform.query("ROLLBACK");
          }
        })(),
      );
      expect(code).toBe("CROSS_CLAN_REFERENCE");
    });
  });

  describe("Tìm kiếm và truy vấn nhánh", () => {
    it("tìm không dấu, kể cả chữ đ (FR-PERSON-05)", async () => {
      const r = await asClan(app, clanA, () =>
        app.query(`SELECT id, birth_year FROM persons WHERE name_unaccent LIKE '%' || $1 || '%'`, ["nguyen van duc"]),
      );
      expect(r.rows).toEqual([{ id: ids.a1, birth_year: 1880 }]);
    });

    it("tìm gần đúng bằng trigram", async () => {
      const r = await asClan(app, clanA, () =>
        app.query(`SELECT id FROM persons WHERE name_unaccent % $1 ORDER BY similarity(name_unaccent, $1) DESC LIMIT 1`, ["nguyen van binh"]),
      );
      expect(r.rows[0]?.id).toBe(ids.a2);
    });

    it("lấy toàn bộ hậu duệ bằng ltree", async () => {
      const r = await asClan(app, clanA, () =>
        app.query(`SELECT id FROM persons WHERE lineage_path <@ '1.1' ORDER BY lineage_path`),
      );
      expect(r.rows.map((x) => x.id)).toEqual([ids.a2, ids.a3]);
    });
  });
});
