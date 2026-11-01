#!/usr/bin/env bash
# Áp dụng migration bằng psql (dùng khi không có Prisma CLI, ví dụ môi trường bị chặn tải engine).
# Thông thường dùng: pnpm --filter @coinguon/db migrate:deploy
# Cách dùng: DATABASE_URL=postgresql://... ./scripts/apply-sql-migrations.sh
set -euo pipefail
cd "$(dirname "$0")/../prisma/migrations"
for dir in $(ls -d */ | sort); do
  echo "→ ${dir%/}"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "${dir}migration.sql"
done
