# PROJECT_CONTEXT — Hệ thống Gia Phả Cội Nguồn

> **File ngữ cảnh sống (living document).** Đây là nguồn sự thật ngắn gọn về hệ thống: đang làm gì, làm thế nào, đã quyết định gì, đang ở đâu.
> Cập nhật file này **mỗi lần có thay đổi đáng kể** (tính năng, schema, API, hạ tầng, quyết định), rồi đưa bản mới vào Project "gia phả" trên claude.ai để Claude đọc lại ở các phiên sau.

| Mục | Giá trị |
| --- | --- |
| Phiên bản file | 0.3.1 |
| Cập nhật lần cuối | 2026-11-01 |
| Người cập nhật | TuanLC, Claude |
| Giai đoạn hiện tại | **Giai đoạn 0 (nền móng) xong — chuẩn bị MVP phần 1** |
| Mã nguồn | https://github.com/CongTuan99bk/giapha (nhánh `main`, CI xanh) |
| Tài liệu đặc tả đầy đủ | "Tài liệu dự án: Hệ thống Gia Phả Cội Nguồn" v1.0 — https://claude.ai/artifact/1Wy2PqEVYSLqycMLH8LMzG |
| Bản thảo kỹ thuật | https://claude.ai/artifact/T24kXNyJ9UkUPdRwMzBkFd |
| Sổ tay chủ sở hữu & vận hành | https://claude.ai/artifact/L9RDuYLadf1AdrDHigLtc1 |
| Hướng dẫn sử dụng (người dùng) | `docs/help/huong-dan-su-dung.md` (chép sang `apps/web/content/help/` khi có apps/web) |

---

## 0. Hướng dẫn đọc file này (cho người và AI)

1. Đọc mục 1–3 để biết hệ thống là gì và đang ở đâu.
2. Trước khi sửa một module, đọc mục 9 (bản đồ module) và mục 8 (quy tắc nghiệp vụ) liên quan.
3. Khi có mâu thuẫn giữa file này và code: **code là sự thật**, file này phải được sửa lại.
4. Khi có mâu thuẫn giữa file này và tài liệu đặc tả v1.0: file này mới hơn nếu ngày cập nhật mới hơn; ghi rõ thay đổi ở mục 17 (CHANGELOG) và mục 16 (ADR).
5. Sau mỗi lần thay đổi: làm theo **mục 20 — Quy trình cập nhật**.

---

## 1. Tóm tắt dự án

Nền tảng gia phả online **đa dòng họ (multi-tenant)**. Mỗi dòng họ có:
- Trang quản trị: dựng phả đồ, quản lý thành viên, bài viết, sự kiện, thư viện, người dùng, thống kê truy cập.
- Website công khai riêng (subdomain hoặc tên miền riêng): phả ký, phả đồ, tin tức, thư viện, lịch giỗ, bản đồ, **thông tin liên hệ ban quản lý**, bộ đếm truy cập.
- PWA cho con cháu trên điện thoại: xem cây, tra xưng hô, nhận nhắc ngày giỗ.
- Super-admin quản lý toàn nền tảng.

Tham chiếu tính năng (chỉ ý tưởng, **không sao chép** code/giao diện/nội dung/thương hiệu): https://giaphadaiviet.vn/tinh-nang/

Người dùng chính: ban liên lạc dòng họ (thường lớn tuổi) → giao diện chữ to, ít bước.

---

## 2. Trạng thái hiện tại

### 2.1. Mốc
| Mốc | Trạng thái | Ghi chú |
| --- | --- | --- |
| Bản thảo kỹ thuật | Xong (2026-11-01) | Công nghệ, hosting, lộ trình, rủi ro |
| Tài liệu đặc tả – phân tích – thiết kế v1.0 | Xong (2026-11-01) | FR/NFR/BR, use case, ERD, API, UI, thống kê, bảo mật, test, vận hành |
| Sổ tay chủ sở hữu & Hướng dẫn sử dụng v1.0 | Xong (2026-11-01) | Viết theo thiết kế; đối chiếu lại tên nút, thêm ảnh chụp khi có giao diện |
| Giai đoạn 0 — Nền móng (tuần 1–2) | **Xong (2026-11-01)** | Monorepo, CI, schema + RLS, genealogy-core, lunar-vn, schemas — 126 test xanh |
| MVP phần 1 — Phả đồ, thành viên (tuần 3–8) | Chưa bắt đầu | |
| MVP phần 2 — Website, sự kiện, xuất, thống kê, liên hệ (tuần 9–14) | Chưa bắt đầu | |
| Phase 2 (tuần 15–24), Phase 3 (tuần 25–32) | Chưa bắt đầu | |

### 2.2. Việc đang làm
- (trống)

### 2.3. Việc tiếp theo
1. (Tuỳ chọn) chuyển kho GitHub về riêng tư.
2. Chạy `prisma generate` + seed dữ liệu mẫu (cây 30 người, 5 đời) trên máy dev.
3. MVP phần 1: `apps/api` (common: TenantGuard đặt `app.clan_id`, auth, clans/members, persons/unions/tree, kinship) và `apps/web` (đăng nhập, trình chỉnh sửa phả đồ dùng `layoutTree`).
4. Chốt các câu hỏi còn lại ở mục 3.2.

---

## 3. Quyết định

### 3.1. Đã chốt
- Ngôn ngữ: TypeScript toàn bộ (frontend, backend, worker).
- Kiến trúc: modular monolith, monorepo pnpm + Turborepo, Docker Compose trên 1 VPS giai đoạn đầu.
- DB: PostgreSQL + Row-Level Security theo `clan_id`; Redis cho cache, hàng đợi, bộ đếm online.
- Mô hình phả hệ: persons – unions – parent_child (kiểu GEDCOM).
- Âm lịch: tự cài đặt theo thuật toán âm lịch Việt Nam (Hồ Ngọc Đức), UTC+7.
- Thống kê truy cập tự xây (không dùng Google Analytics) — xem mục 11.
- Thông tin liên hệ ban quản lý hiển thị ở chân trang + trang Liên hệ, công khai từng trường, cần xác nhận đồng ý.
- Giao diện và nội dung tự thiết kế mới; không dùng thương hiệu của web tham chiếu.
- **Tên sản phẩm: "Gia Phả Cội Nguồn"** (chốt 2026-11-01). Tên package: `@coinguon/*`. Tên miền hệ thống: chưa chọn (cần tra cứu nhãn hiệu).
- Prisma 6.19 (ADR-008); 3 role DB: `coinguon` (migration), `coinguon_app` (bị RLS), `coinguon_platform` (BYPASSRLS) — ADR-009.

### 3.2. Chưa chốt (cần chủ dự án trả lời)
- [ ] Dùng riêng cho một dòng họ hay làm dịch vụ nhiều dòng họ có thu phí?
- [ ] Nơi đặt máy chủ: Việt Nam (Bizfly / Viettel IDC / VNPT) hay Singapore (DigitalOcean)?
- [ ] Ngân sách hạ tầng: 0 USD (demo) hay ~30–40 USD/tháng?
- [ ] Biến thể xưng hô mặc định: Bắc / Trung / Nam?
- [ ] Có dữ liệu gia phả thật để làm bộ test không?
- [ ] Có cần app iOS/Android hay PWA là đủ?
- [x] Tên sản phẩm: Gia Phả Cội Nguồn. - [ ] Tên miền hệ thống (cần tra cứu nhãn hiệu trước).

---

## 4. Công nghệ

| Lớp | Công nghệ |
| --- | --- |
| Web (quản trị + website + PWA) | Next.js (App Router), React, Tailwind CSS, shadcn/ui |
| Phả đồ | React Flow + layout tự viết (Reingold–Tilford/Walker) trong Web Worker; chế độ Canvas khi thu nhỏ |
| API | NestJS (REST, OpenAPI) |
| Validation dùng chung | Zod (`packages/schemas`) |
| ORM / DB | Prisma / PostgreSQL (ltree, pg_trgm, unaccent, RLS) |
| Cache, hàng đợi, bộ đếm | Redis + BullMQ |
| File | Cloudflare R2 (S3-compatible), upload trực tiếp bằng presigned URL |
| Xuất file | ExcelJS; Playwright/Chromium cho PDF/PNG |
| Reverse proxy | Caddy (SSL tự động, on-demand TLS cho tên miền riêng) |
| Test | Vitest, Supertest, Testcontainers, Playwright, k6 |
| Vận hành | Docker, GitHub Actions, Sentry, Uptime Kuma |

---

## 5. Kiến trúc

```
Trình duyệt (máy tính / điện thoại PWA / khách xem website)
        │
   Cloudflare (DNS, CDN, chống DDoS)          ┌──────────────► Cloudflare R2 (ảnh, video, file xuất)
        │                                     │  (tải ảnh trực tiếp bằng URL ký sẵn)
   ┌────▼──────────────── VPS · Docker Compose ───────────────────────┐
   │  Caddy  ── "/"  ──► web (Next.js)                                │
   │         ── "/api" ─► api (NestJS) ──► PostgreSQL (dữ liệu, RLS)  │
   │                              └──────► Redis (cache, queue, online)│
   │  worker (BullMQ) ◄── Redis queue ──► email, giỗ, xuất PDF, ảnh,  │
   │                                       chốt thống kê 00:05         │
   └──────────────────────────────────────────────────────────────────┘
```

---

## 6. Cấu trúc repo (dự kiến)

```
gia-pha-coi-nguon/
├── apps/                    # (MVP) web — Next.js, api — NestJS, worker — BullMQ
├── packages/
│   ├── lunar-vn/            # ✅ @coinguon/lunar-vn — âm lịch VN, tháng nhuận, ngày giỗ, can chi
│   ├── genealogy-core/      # ✅ @coinguon/genealogy-core — FamilyIndex, validateGraph, computeLineage, kinship, layoutTree
│   ├── schemas/             # ✅ @coinguon/schemas — Zod: person, contact (toPublicContact), analytics (heartbeat, statDateVN)
│   ├── db/                  # ✅ @coinguon/db — prisma/schema.prisma, prisma/migrations, scripts/, test/rls.test.ts
│   └── ui/                  # (MVP) component dùng chung
├── infra/docker/            # ✅ compose.dev.yml, postgres/init.sql (role); (sau) caddy/
├── docs/                    # ✅ PROJECT_CONTEXT.md (file này), help/huong-dan-su-dung.md
└── .github/workflows/ci.yml # ✅ license, audit, prisma validate, migrate, drift, build, typecheck, test
```

---

## 7. Mô hình dữ liệu (tóm tắt)

Mọi bảng nghiệp vụ có `clan_id` + RLS. Xoá mềm bằng `deleted_at`.

| Bảng | Cột chính | Ghi chú |
| --- | --- | --- |
| clans | id, name, slug, surname, origin_place, settings | tenant |
| domains | clan_id, hostname, verified_at, ssl_status | tên miền riêng |
| users | id, email, phone, password_hash, google_id | dùng chung nhiều dòng họ |
| clan_members | clan_id, user_id, role, branch_scope_id, person_id | vai trò: owner/admin/editor/member |
| persons | id, clan_id, full_name, name_unaccent, other_names, gender, is_living, birth_date, death_date (jsonb: solar/lunar/precision/raw), death_anniv_lunar, generation, lineage_path (ltree), branch_id, privacy, version | `version` = khoá lạc quan |
| unions | id, partner_a_id, partner_b_id, type, order_index | hôn phối; vợ cả = 1 |
| parent_child | union_id, child_id, relation (ruột/nuôi/riêng), birth_order | con gắn đúng cặp |
| branches, person_facts | | chi/nhánh; thông tin mở rộng |
| posts, categories, events, event_subscriptions, media, albums, places | | nội dung |
| site_settings | clan_id, jsonb | logo, banner, màu, menu, thông tin chung, bật bộ đếm công khai |
| **contacts** | clan_id, member_id?, name, role, phone, email, zalo, photo_media_id, public_fields[], consent_at, consent_by, sort_order | thông tin ban quản lý (mới 2026-11-01) |
| **analytics_daily** | clan_id, date (UTC+7), page_views, unique_visitors, member_views | PK (clan_id, date) — UPSERT |
| **analytics_dims** | clan_id, date, dimension (page/person/referrer/device), key, views | ≤ 100 key/chiều/ngày |
| audit_logs, edit_requests, donations, imports, exports | | |

---

## 8. Quy tắc nghiệp vụ quan trọng (rút gọn — chi tiết ở tài liệu đặc tả mục 5)

- **BR-TREE-02**: cấm vòng lặp tổ tiên. **BR-TREE-07**: sửa người phải gửi `version`, sai → 409.
- **BR-TREE-04**: thuỷ tổ đời 1; con = đời cha + 1; vợ/chồng ngoài họ mang đời người trong họ.
- **BR-KIN-02**: vai vế theo thứ tự nhánh tại điểm rẽ, không theo tuổi. Bảng xưng hô là dữ liệu, có biến thể vùng miền.
- **BR-LUNAR-03/04**: mất tháng nhuận → giỗ tháng thường; mất ngày 30, năm đó tháng thiếu → ngày 29 (cấu hình được).
- **BR-PRIV-01/02**: người còn sống mặc định "chỉ thành viên"; website công khai chỉ hiện họ tên, năm sinh.
- **BR-PRIV-04/05**: liên hệ chỉ công khai khi trường được bật VÀ người đó đã đồng ý; email che một phần.
- **BR-STAT-01..07**: heartbeat 30s; online = có tín hiệu trong 60s; nhiều tab = 1; ngày theo UTC+7; không đếm bot/trang quản trị; chốt 00:05; chi tiết lượt xoá sau 48h.

---

## 9. Bản đồ module

| Module (apps/api/src/modules) | Trách nhiệm | Yêu cầu | Trạng thái |
| --- | --- | --- | --- |
| common | TenantGuard, PolicyGuard, lỗi chuẩn, rate limit | NFR-SEC | Chưa làm |
| auth | Đăng ký, đăng nhập, OTP, 2FA, Google | FR-AUTH | Chưa làm |
| clans, members | Dòng họ, mời, vai trò, phạm vi chi | FR-CLAN | Chưa làm |
| persons, unions, tree | CRUD người/quan hệ, cây có cache, mã xem | FR-TREE, FR-PERSON | Logic lõi xong (`genealogy-core`); API chưa làm |
| kinship | Tra xưng hô | FR-KIN | Logic lõi xong (`kinship()`); bảng chưa duyệt (KI-001); API chưa làm |
| events | Sự kiện, lịch giỗ, nhắc | FR-EVENT | Logic lõi xong (`lunar-vn`); API, job chưa làm |
| import-export | Excel, PDF/ảnh, sao lưu, GEDCOM (P2) | FR-IO | Chưa làm |
| media, posts, places | Thư viện, bài viết, bản đồ | FR-MEDIA, FR-CONTENT, FR-GRAVE | Chưa làm |
| site-settings, contacts, domains | Website, liên hệ ban quản lý, tên miền | FR-SITE | Chưa làm |
| analytics | Heartbeat, page view, online realtime (SSE), báo cáo ngày | FR-STAT | Chưa làm |
| audit, trash | Nhật ký, thùng rác | FR-ADMIN | Chưa làm |
| platform, billing | Super-admin, gói cước (P3), quyền hỗ trợ có thời hạn, ẩn nội dung vi phạm | FR-PLAT | Chưa làm |
| help (apps/web) | Trang Trợ giúp `/tro-giup` render `content/help/*.md` | — | Chưa làm |

---

## 10. API — quy ước & endpoint chính

- Tiền tố `/api/v1`; cookie phiên `sid` + header `X-CSRF-Token`; lỗi `{code, message, details}`; phân trang `{items,total,page,pageSize}`.
- Endpoint nghiệp vụ dưới `/clans/:clanId/...`; công khai dưới `/public/sites/:host/...`; thu thập thống kê `/t/pv`, `/t/hb`.
- Mới (2026-11-01): `/clans/:clanId/contacts`, `/contacts/:id/consent`, `/analytics/live`, `/analytics/live/stream` (SSE), `/analytics/daily`, `/analytics/breakdown`, `/analytics/export`, `/public/sites/:host/counters`, `/public/sites/:host/contact-messages`.
- Danh sách đầy đủ: tài liệu đặc tả mục 9.

---

## 11. Thống kê truy cập (tóm tắt)

- Trình duyệt (`apps/web/lib/tracker.ts`): `visitor_id` ngẫu nhiên trong cookie 1 năm; `sendBeacon` `/t/pv` mỗi lần tải trang; `/t/hb` mỗi 30s khi tab hiển thị.
- Redis: `ZADD online:{clan} now visitor` + `ZREMRANGEBYSCORE` cửa sổ 60s → `ZCARD` = đang online. `INCR pv:{clan}:{date}`, `PFADD uv:{clan}:{date}`, `HINCRBY dim:{clan}:{date}`.
- Worker `stats.rollup` 00:05 UTC+7: UPSERT `analytics_daily`, `analytics_dims`; key Redis đã chốt đặt TTL 3 ngày.
- Bảng điều khiển: SSE 10s. Trang Thống kê: ngày cũ từ PostgreSQL + hôm nay từ Redis. Bộ đếm công khai cache 30s.
- Không lưu IP thô. Redis bật AOF.

---

## 12. Bảo mật & riêng tư (bắt buộc)

- RLS + TenantGuard; test phân tách tenant chạy trong CI (TC-SEC-01).
- Argon2id, 2FA cho owner/super-admin, khoá tạm sau 5 lần sai, rate limit mã xem phả đồ 10 lần/15 phút/IP.
- Tuân thủ Luật BVDLCN 91/2025/QH15 + NĐ 356/2025/NĐ-CP: riêng tư mặc định, đồng ý trước khi công khai liên hệ, quyền xem/sửa/xoá dữ liệu.
- Sở hữu trí tuệ: không sao chép web tham chiếu; chỉ dùng thư viện MIT/Apache/BSD/ISC; không GPL/AGPL/"non-commercial".

---

## 13. Quy ước code

- Nhánh: `feat/<module>-<mô-tả>`, `fix/...`, `chore/...`. Commit theo Conventional Commits (`feat(tree): ...`).
- Backend: controller → service → repository; module khác chỉ gọi service công khai hoặc nghe sự kiện.
- Tên DB snake_case, TS camelCase, file kebab-case. Mã yêu cầu (FR-/BR-/TC-) ghi trong mô tả PR và tên test.
- Logic thuần (cây, xưng hô, âm lịch) chỉ ở `packages/*`, không phụ thuộc DB/UI.
- Migration tương thích ngược; không sửa migration đã chạy ở production.
- PR không merge nếu lint/typecheck/test đỏ hoặc chưa cập nhật file này khi cần.

---

## 14. Lệnh thường dùng (sẽ cập nhật khi có code)

```bash
pnpm install
cp .env.example .env
pnpm dev:infra                 # postgres, redis, minio, mailpit (Docker)
pnpm db:migrate:deploy         # chạy migration (Prisma)
pnpm --filter @coinguon/db migrate:sql   # thay thế bằng psql khi không có Prisma CLI
pnpm build && pnpm typecheck && pnpm test
pnpm coverage                  # ngưỡng 90% cho lunar-vn, genealogy-core
# (MVP) pnpm dev · pnpm test:e2e
```

Test DB tích hợp cần `TEST_DATABASE_URL`, `TEST_APP_DATABASE_URL`, `TEST_PLATFORM_DATABASE_URL`.

---

## 15. Biến môi trường (dự kiến)

| Biến | Dùng cho |
| --- | --- |
| DATABASE_URL | PostgreSQL — role chủ, chạy migration |
| APP_DATABASE_URL | Role `coinguon_app` (bị RLS) — dùng trong api/web |
| PLATFORM_DATABASE_URL | Role `coinguon_platform` (BYPASSRLS) — worker, super-admin |
| DATA_ENCRYPTION_KEY | Mã hoá cột nhạy cảm (nhóm máu) |
| REDIS_URL | Redis |
| R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET | Lưu file |
| APP_BASE_DOMAIN | Tên miền hệ thống (subdomain dòng họ) |
| SESSION_SECRET, CSRF_SECRET | Phiên |
| SMTP_* hoặc RESEND_API_KEY | Email |
| GOOGLE_CLIENT_ID/SECRET | Đăng nhập Google |
| TURNSTILE_SITE_KEY/SECRET | Chống spam form liên hệ |
| SENTRY_DSN | Theo dõi lỗi |
| TZ_BUSINESS=Asia/Ho_Chi_Minh | Ngày thống kê, âm lịch |

---

## 16. Nhật ký quyết định kiến trúc (ADR)

| Mã | Ngày | Quyết định | Lý do | Thay thế đã cân nhắc |
| --- | --- | --- | --- | --- |
| ADR-001 | 2026-11-01 | TypeScript toàn bộ, monorepo | Dùng chung kiểu/validation, dễ bảo trì | Laravel/PHP, Supabase thuần |
| ADR-002 | 2026-11-01 | Mô hình persons–unions–parent_child | Đúng với nhiều hôn phối, con nuôi, con riêng | Cột father_id/mother_id |
| ADR-003 | 2026-11-01 | PostgreSQL RLS cho multi-tenant | Chặn lộ dữ liệu ngay cả khi code lỗi | DB riêng mỗi dòng họ |
| ADR-004 | 2026-11-01 | Tự xây thống kê truy cập (Redis + rollup) | Online realtime theo dòng họ, không gửi dữ liệu ra bên thứ ba | Google Analytics, Plausible, Umami |
| ADR-005 | 2026-11-01 | HyperLogLog cho khách duy nhất | 12 KB/ngày/dòng họ, sai số ~0,8% chấp nhận được | Lưu từng visitor_id |
| ADR-006 | 2026-11-01 | Liên hệ ban quản lý trong bảng `contacts` riêng, công khai từng trường + consent | Tuân thủ luật dữ liệu cá nhân, linh hoạt nhiều người | Gộp vào site_settings |
| ADR-007 | 2026-11-01 | Một VPS + Docker Compose + Caddy giai đoạn đầu | Chi phí ~30–40 USD/tháng, tên miền riêng có SSL tự động | Vercel + dịch vụ managed |
| ADR-008 | 2026-11-01 | Prisma 6.19 (chưa lên 7/8) | Ổn định, ít thay đổi cấu hình; Prisma 7 bắt buộc driver adapter + prisma.config.ts — cân nhắc nâng cấp khi làm api | Prisma 7.10, Drizzle |
| ADR-009 | 2026-11-01 | Ràng buộc phả hệ cả ở DB (trigger chặn vòng lặp, tự làm cha mẹ, nối chéo dòng họ) ngoài kiểm tra ở `genealogy-core` | Phòng thủ nhiều lớp; FK không xét RLS nên cần trigger chặn nối người khác dòng họ | Chỉ kiểm tra ở service |

---

## 17. CHANGELOG

Định dạng: `## [phiên bản] — YYYY-MM-DD` rồi các mục Thêm / Sửa / Xoá / Bảo mật.

## [0.3.1] — 2026-11-01
### Bảo mật
- CI `pnpm audit` phát hiện 2 lỗ hổng mức cao: nâng `zod` 3.25 → 4.6.7 (GHSA-mrhx-c7xc-m3w5); ép `deepmerge-ts` ^8.0.2 qua `overrides` trong `pnpm-workspace.yaml` cho Prisma 6.19 (GHSA-ggr8-5vv4-36mx). Bỏ override khi nâng lên Prisma 7.
### Hạ tầng
- Mã nguồn lên https://github.com/CongTuan99bk/giapha; CI chạy đủ: giấy phép, audit, prisma validate, migrate, check-drift, build, typecheck, 126 test.

## [0.3.0] — 2026-11-01 — Giai đoạn 0: nền móng
### Thêm
- Monorepo pnpm + Turborepo, TypeScript strict, Vitest, CI GitHub Actions.
- `@coinguon/lunar-vn`: đổi âm–dương (UTC+7), tháng nhuận, độ dài tháng, ngày giỗ (BR-LUNAR-02..05, luật ngày 30 cấu hình được), can chi, định dạng. Test: mọi ngày 1900–2100 và lấy mẫu 1200–2199.
- `@coinguon/genealogy-core`: `FamilyIndex`, `validateGraph`/`wouldCreateCycle` (BR-TREE-01..05), `computeLineage` (đời, thuộc họ theo cha/mẹ, ltree path), `kinship` (LCA, vai theo nhánh, nội/ngoại, dâu rể, biến thể Bắc/Trung/Nam), `layoutTree` (20.000 người < 0,5 giây).
- `@coinguon/schemas`: person (tạo/sửa có version), flexible date, contact + `toPublicContact` (BR-PRIV-04/05), analytics (heartbeat, page view, `isBotUserAgent` không chặn app Zalo, `statDateVN`).
- `@coinguon/db`: schema 29 bảng, migration khởi tạo, RLS 25 policy, trigger tìm không dấu (kể cả "đ"), GIN trigram, GiST ltree, trigger chặn vòng lặp / tự làm cha mẹ / nối chéo dòng họ; 3 role DB.
- `infra/docker/compose.dev.yml`, `.env.example`, `docs/help/huong-dan-su-dung.md`.
### Sửa (so với thuật toán âm lịch gốc phổ biến)
- Ngày 7/5/2054 bị đổi thành "ngày 0" vì ước lượng sóc lệch hai tháng → tìm lùi tới khi gặp sóc đúng.
- Năm nhuận sau tháng Chạp (vd. 1403): công thức số tháng nhuận cho ra 0 → không đổi ngược được → sửa công thức.
- Ngày 15–31/10/1582 bị coi là không hợp lệ (chuyển lịch Julius → Gregory) → kiểm tra bằng đổi qua lại số ngày Julius.
### Đổi tên
- Tên sản phẩm "Gia Phả Online" (tạm) → **"Gia Phả Cội Nguồn"**.

## [0.2.0-design] — 2026-11-01
### Thêm
- Sổ tay chủ sở hữu & vận hành (13 mục: tài khoản dịch vụ, khởi tạo, super-admin, vận hành định kỳ, sao lưu/khôi phục, phát hành, xử lý sự cố, yêu cầu dữ liệu cá nhân, chi phí).
- Hướng dẫn sử dụng cho người dùng `huong-dan-su-dung.md` (24 mục + FAQ + quyền riêng tư) — để render trong trang Trợ giúp.
- Yêu cầu phát sinh từ tài liệu hướng dẫn (cần bổ sung vào đặc tả khi làm module):
  - FR-PLAT-03: chủ sở hữu dòng họ cấp "quyền hỗ trợ" có thời hạn (mặc định 48h) cho super-admin; mọi thao tác gắn nhãn "hỗ trợ" trong nhật ký.
  - FR-PLAT-04: super-admin ẩn nội dung vi phạm (bài, ảnh) khi có khiếu nại; ghi nhật ký.
  - FR-AUTH-07: người dùng tự rời dòng họ / xoá tài khoản; dữ liệu gia phả đã nhập vẫn thuộc dòng họ.
  - FR-SITE-11: quản trị đánh dấu "Đã được đồng ý" kèm ghi chú cách xác nhận cho người liên hệ không có tài khoản; người liên hệ rút đồng ý → ẩn ngay.
  - FR-HELP-01: trang `/tro-giup` hiển thị hướng dẫn, mục lục theo tiêu đề "##".

## [0.1.0-design] — 2026-11-01
### Thêm
- Bản thảo kỹ thuật và tài liệu đặc tả – phân tích – thiết kế v1.0.
- Yêu cầu mới: số người đang truy cập thời gian thực (FR-STAT-01, 02), lượt truy cập và khách duy nhất theo ngày (FR-STAT-03..09), thông tin liên hệ ban quản lý trên website (FR-SITE-04..08).
- Bảng mới: `contacts`, `analytics_daily`, `analytics_dims`.
- Mục sở hữu trí tuệ (tài liệu đặc tả 12.4).

---

## 18. Nợ kỹ thuật & vấn đề đã biết

| Mã | Mô tả | Mức | Kế hoạch |
| --- | --- | --- | --- |
| KI-001 | Bảng xưng hô đầy đủ theo 3 miền chưa có, cần người am hiểu duyệt | Cao | Trước khi phát hành MVP |
| KI-002 | Khách chặn cookie/JS không được đếm thống kê | Thấp | Chấp nhận |
| KI-003 | Redis mất dữ liệu làm mất số liệu ngày đang chạy | Thấp | Bật AOF |
| KI-004 | Thời hạn phản hồi yêu cầu dữ liệu cá nhân (NĐ 356/2025) chưa được luật sư xác nhận | Trung bình | Trước khi mở dịch vụ — điền vào sổ tay mục 11 |
| KI-005 | Hướng dẫn sử dụng viết theo thiết kế, chưa có ảnh chụp màn hình | Thấp | Cập nhật cuối mỗi giai đoạn MVP |
| KI-006 | ~~Migration SQL khởi tạo viết tay~~ — **đã xác nhận** khớp schema.prisma qua CI `check-drift` (2026-11-01) | Đã xử lý | Giữ bước check-drift trong CI |
| KI-007 | `clan_id` ở nhiều bảng nội dung chưa có khoá ngoại tới `clans` (chỉ dựa RLS + xoá theo clan_id) | Thấp | Job xoá cứng dòng họ phải xoá mọi bảng theo `clan_id` |
| KI-008 | Bố cục phả đồ hiện là dạng "khối căn giữa", chưa nén nhánh kiểu Reingold–Tilford (cây rộng hơn cần thiết) | Thấp | Tối ưu khi làm trình chỉnh sửa phả đồ nếu cây quá rộng |

---

## 19. Tài liệu liên quan

- Tài liệu dự án v1.0 (đặc tả, phân tích, thiết kế): https://claude.ai/artifact/1Wy2PqEVYSLqycMLH8LMzG
- Bản thảo kỹ thuật (công nghệ, hosting, lộ trình, rủi ro): https://claude.ai/artifact/T24kXNyJ9UkUPdRwMzBkFd
- Sổ tay chủ sở hữu & vận hành: https://claude.ai/artifact/L9RDuYLadf1AdrDHigLtc1
- Hướng dẫn sử dụng cho người dùng: `docs/help/huong-dan-su-dung.md` (mục 1–24 được sổ tay mục 6 tham chiếu theo số — giữ nguyên số mục khi sửa)
- Luật BVDLCN 91/2025/QH15; Nghị định 356/2025/NĐ-CP.

---

## 20. Quy trình cập nhật file này

Sau mỗi lần thay đổi (một PR, một tính năng, một quyết định):

1. Tăng "Phiên bản file" và "Cập nhật lần cuối" ở đầu file.
2. Cập nhật mục **2 (Trạng thái)** và **9 (Bản đồ module — cột Trạng thái)**.
3. Nếu đổi schema → mục 7. Đổi API → mục 10. Đổi quy tắc → mục 8 (và tài liệu đặc tả).
4. Nếu có quyết định kiến trúc → thêm dòng ADR ở mục 16.
5. Thêm mục vào **CHANGELOG** (mục 17) theo mẫu bên dưới.
6. Vấn đề chưa xử lý → mục 18.
6b. Đổi tính năng người dùng nhìn thấy → sửa `huong-dan-su-dung.md` (tăng `version`) và bảng mục 6 của Sổ tay. Đổi quy trình vận hành → sửa Sổ tay.
7. Tải bản mới lên Project "gia phả" (thay bản cũ), hoặc nhờ Claude cập nhật trực tiếp.

Mẫu một mục CHANGELOG:

```markdown
## [0.2.0] — YYYY-MM-DD
### Thêm
- <tính năng> (FR-XXX-NN) — module `<tên>`, file chính `<đường dẫn>`
### Sửa
- <lỗi/thay đổi> — nguyên nhân, cách sửa
### Schema
- Migration `<tên>`: <thay đổi bảng/cột>
### Ghi chú cho người bảo trì
- <điều cần biết, rủi ro, việc còn dở>
```
