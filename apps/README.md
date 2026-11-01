# apps/

Sẽ có ở giai đoạn MVP (tuần 3 trở đi), theo `docs/PROJECT_CONTEXT.md` mục 6 và 9:

- `web/` — Next.js: trang quản trị, website dòng họ theo tên miền, PWA, trang Trợ giúp (`content/help/` ← `docs/help/`).
- `api/` — NestJS: module theo bản đồ module; kết nối DB bằng role `coinguon_app`, đặt `app.clan_id` mỗi request.
- `worker/` — BullMQ: nhắc giỗ, xuất PDF/ảnh, chốt thống kê 00:05, sao lưu; dùng role `coinguon_platform` khi cần đọc nhiều dòng họ.
