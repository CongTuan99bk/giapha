-- Khởi tạo role cơ sở dữ liệu (chạy một lần khi tạo database, KHÔNG nằm trong migration
-- vì role là cấp cluster). Đổi mật khẩu ở môi trường thật — mật khẩu dưới đây chỉ cho máy dev.
--
--   coinguon        : chủ sở hữu schema, chạy migration
--   coinguon_app    : ứng dụng web/API — bị Row-Level Security giới hạn theo dòng họ
--   coinguon_platform: worker tổng hợp số liệu, super-admin — BYPASSRLS, chỉ dùng ở code nền tảng

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'coinguon_app') THEN
    CREATE ROLE coinguon_app LOGIN PASSWORD 'coinguon_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'coinguon_platform') THEN
    CREATE ROLE coinguon_platform LOGIN PASSWORD 'coinguon_platform' NOSUPERUSER BYPASSRLS;
  END IF;
END $$;

-- Quyền trên bảng hiện có và bảng do role chạy migration (coinguon) tạo sau này
GRANT USAGE ON SCHEMA public TO coinguon_app, coinguon_platform;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO coinguon_app, coinguon_platform;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO coinguon_app, coinguon_platform;
ALTER DEFAULT PRIVILEGES FOR ROLE coinguon IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO coinguon_app, coinguon_platform;
ALTER DEFAULT PRIVILEGES FOR ROLE coinguon IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO coinguon_app, coinguon_platform;
