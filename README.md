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

## Demo nhanh có link chia sẻ (0 đồng)

Cần **Docker Desktop**, **Git**, **Node.js LTS ≥ 22** và **pnpm 10** (`npm install -g pnpm@10`). Rồi:

```bash
git clone https://github.com/CongTuan99bk/giapha.git && cd giapha
pnpm demo --du-lieu-mau     # in ra link https://….trycloudflare.com + tài khoản mẫu
```

Chi tiết, cách chạy 24/7 miễn phí (Oracle Cloud) hoặc trên VPS: **`docs/TRIEN-KHAI.md`**.

## Chạy trên máy cá nhân (phát triển)

Cần cài: **Node.js LTS** (22.9 trở lên), **pnpm 10** (`npm install -g pnpm@10`), **Docker Desktop**, **Git**.

```bash
git clone https://github.com/CongTuan99bk/giapha.git
cd giapha
pnpm install
pnpm dev:infra       # bật PostgreSQL, Redis… trong Docker (lần đầu tải image hơi lâu)
pnpm khoi-tao        # tạo .env, tạo bảng, build, tạo dữ liệu mẫu GIẢ + tài khoản quản lý
pnpm dev             # chạy API (cổng 4000) + giao diện (cổng 3000)
```

Mở http://localhost:3000 và đăng nhập bằng tài khoản in ra ở bước `pnpm khoi-tao`
(mặc định `quanly@giapha.test` / `giapha-demo-2026`, đổi trong `.env` trước khi khởi tạo).
Muốn xoá dữ liệu mẫu để nhập gia phả thật từ đầu:

```bash
pnpm dev:infra:reset   # XOÁ toàn bộ dữ liệu trong Docker trên máy này
pnpm dev:infra
pnpm khoi-tao --trong  # tạo bảng, không tạo dữ liệu mẫu
pnpm dev               # vào http://localhost:3000/dang-ky — người đăng ký đầu tiên tạo dòng họ
```

Lệnh khác:

```bash
pnpm build && pnpm test        # build + toàn bộ test
pnpm --filter @coinguon/web test:e2e   # test giao diện trên trình duyệt (cần DB coinguon_e2e, xem CI)
pnpm coverage                  # độ phủ ≥ 90% cho lunar-vn, genealogy-core
```

Test tích hợp DB chạy khi có biến `TEST_DATABASE_URL`, `TEST_APP_DATABASE_URL`, `TEST_PLATFORM_DATABASE_URL` (xem `.github/workflows/ci.yml`).

## Quy tắc bắt buộc

- Logic cây, xưng hô, âm lịch chỉ nằm trong `packages/*`, không phụ thuộc DB/giao diện.
- Ứng dụng kết nối DB bằng role `coinguon_app` và đặt `app.clan_id` cho mỗi request — Row-Level Security chặn đọc chéo dòng họ.
- Mỗi PR: CI xanh + cập nhật `docs/PROJECT_CONTEXT.md` (mục 20).
- Chỉ dùng thư viện giấy phép MIT/Apache/BSD/ISC; ngoại lệ có lý do trong `scripts/check-licenses.mjs` (CI kiểm tra).

## Ghi công

Thuật toán âm lịch dựa trên công bố của Hồ Ngọc Đức (thuật toán thiên văn theo Jean Meeus), được cài đặt lại và sửa hai lỗi biên (xem CHANGELOG trong `docs/PROJECT_CONTEXT.md`).
