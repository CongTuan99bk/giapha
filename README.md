# Gia Phả Cội Nguồn

Gia phả online cho một dòng họ (kiến trúc sẵn sàng mở rộng nhiều dòng họ): dựng phả đồ, tra xưng hô, lịch giỗ âm lịch, website dòng họ, thống kê truy cập. Dùng trên máy tính, điện thoại (PWA) và sắp có app iOS/Android.

> Đọc **`docs/PROJECT_CONTEXT.md`** trước khi làm bất cứ việc gì — đó là nguồn sự thật về trạng thái, quyết định và quy ước của dự án.

## Trạng thái

MVP phần 1 đang làm: API và giao diện phả đồ **chạy được** (2026-11-01); tiếp theo là mời thành viên (xem `docs/PROJECT_CONTEXT.md` mục 2).

| Package | Nội dung | Test |
| --- | --- | --- |
| `packages/lunar-vn` | Âm lịch Việt Nam (UTC+7), tháng nhuận, ngày giỗ, can chi | 39 test, phủ 98% |
| `packages/genealogy-core` | Chỉ mục cây, kiểm tra hợp lệ, đời/chi, xưng hô (Bắc/Trung/Nam), bố cục phả đồ | 48 test, phủ 95% |
| `packages/schemas` | Zod schema dùng chung; quy tắc hiển thị liên hệ, thống kê | 28 test |
| `packages/db` | Prisma schema, migration SQL, Row-Level Security, trigger toàn vẹn | 12 test trên PostgreSQL thật |
| `apps/api` | NestJS + Kysely: đăng nhập, dòng họ, người & quan hệ, phả đồ, xưng hô, dữ liệu mẫu | 36 test trên PostgreSQL thật |
| `apps/web` | Next.js: đăng nhập, phả đồ kéo/phóng to, thêm/sửa/xoá người, danh sách, xưng hô, trợ giúp, PWA | 23 test + 11 test trình duyệt (Playwright) |

## Cấu trúc

```
apps/
  api/                # NestJS + Kysely (REST /api/v1)
  web/                # Next.js — giao diện, PWA
packages/
  lunar-vn/           # logic thuần, không I/O
  genealogy-core/     # logic thuần, không I/O
  schemas/            # Zod, dùng chung web + api + nhập Excel
  db/                 # prisma/schema.prisma, prisma/migrations, scripts, test tích hợp
infra/docker/         # compose.dev.yml, postgres/init.sql (role ứng dụng & nền tảng)
docs/                 # PROJECT_CONTEXT.md, hướng dẫn sử dụng
.github/workflows/    # CI
```

## Bắt đầu trên máy dev

Yêu cầu: Node 22, pnpm 10, Docker.

```bash
pnpm install
cp .env.example .env
pnpm dev:infra                 # PostgreSQL, Redis, MinIO, Mailpit
pnpm db:migrate:deploy         # chạy migration
pnpm build && pnpm test        # build + toàn bộ test
pnpm coverage                  # kiểm tra độ phủ ≥ 90% cho lunar-vn, genealogy-core

# chạy thử với dữ liệu GIẢ (cần APP_DATABASE_URL, PLATFORM_DATABASE_URL trong .env)
pnpm --filter @coinguon/api seed   # in ra email/mật khẩu đăng nhập
pnpm --filter @coinguon/api dev    # API  http://localhost:4000/api/v1
pnpm --filter @coinguon/web dev    # Web  http://localhost:3000
```

Test tích hợp DB chạy khi có biến `TEST_DATABASE_URL`, `TEST_APP_DATABASE_URL`, `TEST_PLATFORM_DATABASE_URL` (xem `.github/workflows/ci.yml`).

## Quy tắc bắt buộc

- Logic cây, xưng hô, âm lịch chỉ nằm trong `packages/*`, không phụ thuộc DB/giao diện.
- Ứng dụng kết nối DB bằng role `coinguon_app` và đặt `app.clan_id` cho mỗi request — Row-Level Security chặn đọc chéo dòng họ.
- Mỗi PR: CI xanh + cập nhật `docs/PROJECT_CONTEXT.md` (mục 20).
- Chỉ dùng thư viện giấy phép MIT/Apache/BSD/ISC; ngoại lệ có lý do trong `scripts/check-licenses.mjs` (CI kiểm tra).

## Ghi công

Thuật toán âm lịch dựa trên công bố của Hồ Ngọc Đức (thuật toán thiên văn theo Jean Meeus), được cài đặt lại và sửa hai lỗi biên (xem CHANGELOG trong `docs/PROJECT_CONTEXT.md`).
