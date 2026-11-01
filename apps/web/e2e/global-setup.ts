import pg from "pg";

/** Xoá sạch database e2e trước mỗi lần chạy (dùng role chủ sở hữu, không bị RLS). */
export default async function globalSetup() {
  const db = process.env.E2E_DATABASE_NAME ?? "coinguon_e2e";
  const host = process.env.E2E_DB_HOST ?? "localhost:5432";
  const client = new pg.Client({ connectionString: `postgresql://coinguon:coinguon@${host}/${db}` });
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
