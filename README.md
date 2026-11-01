# Gia Phả Cội Nguồn

Nền tảng gia phả online đa dòng họ: dựng phả đồ, tra xưng hô, lịch giỗ âm lịch, website riêng cho từng dòng họ, thống kê truy cập.

> Đọc **`docs/PROJECT_CONTEXT.md`** trước khi làm bất cứ việc gì — đó là nguồn sự thật về trạng thái, quyết định và quy ước của dự án.

## Trạng thái

Giai đoạn 0 — Nền móng: **xong** (2026-11-01). Chưa có giao diện và API; bước tiếp theo là `apps/api` và `apps/web` (xem `docs/PROJECT_CONTEXT.md` mục 2).

| Package | Nội dung | Test |
| --- | --- | --- |
| `packages/lunar-vn` | Âm lịch Việt Nam (UTC+7), tháng nhuận, ngày giỗ, can chi | 39 test, phủ 98% |
| `packages/genealogy-core` | Chỉ mục cây, kiểm tra hợp lệ, đời/chi, xưng hô (Bắc/Trung/Nam), bố cục phả đồ | 47 test, phủ 95% |
| `packages/schemas` | Zod schema dùng chung; quy tắc hiển thị liên hệ, thống kê | 28 test |
| `packages/db` | Prisma schema, migration SQL, Row-Level Security, trigger toàn vẹn | 12 test trên PostgreSQL thật |

## Cấu trúc

```
apps/                 # (sắp có) web — Next.js, api — NestJS, worker — BullMQ
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
pnpm build && pnpm test        # test logic lõi
pnpm coverage                  # kiểm tra độ phủ ≥ 90% cho lunar-vn, genealogy-core
```

Test tích hợp DB chạy khi có biến `TEST_DATABASE_URL`, `TEST_APP_DATABASE_URL`, `TEST_PLATFORM_DATABASE_URL` (xem `.github/workflows/ci.yml`).

## Quy tắc bắt buộc

- Logic cây, xưng hô, âm lịch chỉ nằm trong `packages/*`, không phụ thuộc DB/giao diện.
- Ứng dụng kết nối DB bằng role `coinguon_app` và đặt `app.clan_id` cho mỗi request — Row-Level Security chặn đọc chéo dòng họ.
- Mỗi PR: CI xanh + cập nhật `docs/PROJECT_CONTEXT.md` (mục 20).
- Chỉ dùng thư viện giấy phép MIT/Apache/BSD/ISC (CI kiểm tra).

## Ghi công

Thuật toán âm lịch dựa trên công bố của Hồ Ngọc Đức (thuật toán thiên văn theo Jean Meeus), được cài đặt lại và sửa hai lỗi biên (xem CHANGELOG trong `docs/PROJECT_CONTEXT.md`).
