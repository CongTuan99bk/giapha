#!/usr/bin/env node
/**
 * Kiểm tra migration SQL khớp schema.prisma (chạy trong CI).
 *
 * Dùng `prisma migrate diff` từ thư mục migration tới schema; mọi khác biệt đều là lỗi,
 * trừ các đối tượng Prisma không mô tả được trong schema và được tạo bằng SQL tay
 * (danh sách ALLOWED dưới đây).
 *
 * Cần biến SHADOW_DATABASE_URL trỏ tới một database trống.
 */
import { execFileSync } from "node:child_process";

const ALLOWED = [
  // Chỉ mục GiST trên cột ltree (kiểu Unsupported) — tạo trong migration rls_search_integrity
  /^DROP INDEX "persons_lineage_path_gist_idx";$/,
];

const shadow = process.env.SHADOW_DATABASE_URL;
if (!shadow) {
  console.error("Thiếu SHADOW_DATABASE_URL");
  process.exit(1);
}

const out = execFileSync(
  "npx",
  [
    "prisma",
    "migrate",
    "diff",
    "--from-migrations",
    "prisma/migrations",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--shadow-database-url",
    shadow,
    "--script",
  ],
  { encoding: "utf8" },
);

const statements = out
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("--"));
const unexpected = statements.filter((s) => !ALLOWED.some((re) => re.test(s)));

if (unexpected.length > 0) {
  console.error("Migration SQL lệch với schema.prisma:\n" + unexpected.join("\n"));
  console.error("\nSửa schema hoặc tạo migration mới bằng: pnpm --filter @coinguon/db migrate:dev --create-only");
  process.exit(1);
}
console.log("Migration khớp schema.prisma");
