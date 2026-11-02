#!/bin/sh
# Tạo role ứng dụng cho PRODUCTION/DEMO bằng mật khẩu lấy từ biến môi trường (không ghi cứng như init.sql bản dev).
# Docker postgres tự chạy file này MỘT LẦN khi khởi tạo volume dữ liệu mới.
#   coinguon_app      : API — bị Row-Level Security giới hạn theo dòng họ
#   coinguon_platform : tác vụ nền tảng, tra lời mời — BYPASSRLS
set -eu
: "${APP_DB_PASSWORD:?Thiếu APP_DB_PASSWORD}"
: "${PLATFORM_DB_PASSWORD:?Thiếu PLATFORM_DB_PASSWORD}"
OWNER="${POSTGRES_USER:-coinguon}"

psql -v ON_ERROR_STOP=1 --username "$OWNER" --dbname "${POSTGRES_DB:-$OWNER}" \
  -v app_pw="$APP_DB_PASSWORD" -v platform_pw="$PLATFORM_DB_PASSWORD" -v owner="$OWNER" <<'EOSQL'
SELECT format('CREATE ROLE coinguon_app LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', :'app_pw')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'coinguon_app') \gexec
SELECT format('CREATE ROLE coinguon_platform LOGIN PASSWORD %L NOSUPERUSER BYPASSRLS', :'platform_pw')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'coinguon_platform') \gexec

GRANT USAGE ON SCHEMA public TO coinguon_app, coinguon_platform;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO coinguon_app, coinguon_platform;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO coinguon_app, coinguon_platform;
-- Bảng do role chủ (chạy migration) tạo sau này cũng tự cấp quyền
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO coinguon_app, coinguon_platform;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO coinguon_app, coinguon_platform;
EOSQL
echo "Đã tạo role coinguon_app, coinguon_platform"
