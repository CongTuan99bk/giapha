#!/usr/bin/env node
/**
 * Chạy migration SQL (prisma/migrations/<tên>/migration.sql) theo thứ tự, mỗi migration trong một transaction.
 *
 * Ghi vào bảng `_prisma_migrations` ĐÚNG như `prisma migrate deploy` (cùng cột, checksum = sha256 nội dung file),
 * nên hai cách dùng thay nhau được. Lý do có file này: máy chủ/Docker không phải tải bộ máy của Prisma CLI.
 *
 *   DATABASE_URL=postgresql://... node scripts/migrate.mjs [thư-mục-migrations]
 */
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "../prisma/migrations");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Thiếu DATABASE_URL");
  process.exit(1);
}

const migrations = readdirSync(dir)
  .filter((name) => statSync(join(dir, name)).isDirectory())
  .sort()
  .map((name) => {
    const sql = readFileSync(join(dir, name, "migration.sql"), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  });

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  // Khoá để hai tiến trình (vd. hai container khởi động cùng lúc) không chạy migration chồng nhau
  await client.query("SELECT pg_advisory_lock(72707369)");
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum"            VARCHAR(64) NOT NULL,
      "finished_at"         TIMESTAMPTZ,
      "migration_name"      VARCHAR(255) NOT NULL,
      "logs"                TEXT,
      "rolled_back_at"      TIMESTAMPTZ,
      "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )`);
  const { rows } = await client.query(
    `SELECT migration_name, checksum, finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`,
  );
  const applied = new Map(rows.map((r) => [r.migration_name, r]));

  const failed = rows.filter((r) => r.finished_at === null);
  if (failed.length) {
    throw new Error(`Migration dang dở (lỗi lần trước): ${failed.map((r) => r.migration_name).join(", ")}. Xử lý tay rồi chạy lại.`);
  }

  let count = 0;
  for (const m of migrations) {
    const prev = applied.get(m.name);
    if (prev) {
      if (prev.checksum !== m.checksum) {
        throw new Error(`Migration "${m.name}" đã chạy nhưng file bị sửa sau đó (checksum khác). Không sửa migration đã chạy — hãy tạo migration mới.`);
      }
      continue;
    }
    process.stdout.write(`→ ${m.name} … `);
    await client.query("BEGIN");
    try {
      await client.query(m.sql);
      await client.query(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count, started_at)
         VALUES ($1, $2, now(), $3, 1, now())`,
        [randomUUID(), m.checksum, m.name],
      );
      await client.query("COMMIT");
      count++;
      console.log("xong");
    } catch (err) {
      await client.query("ROLLBACK");
      console.log("LỖI");
      throw err;
    }
  }
  console.log(count ? `Đã chạy ${count} migration.` : "Cơ sở dữ liệu đã ở phiên bản mới nhất.");
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.query("SELECT pg_advisory_unlock(72707369)").catch(() => undefined);
  await client.end();
}
