# PROJECT_CONTEXT — Hệ thống Gia Phả Cội Nguồn

> **File ngữ cảnh sống (living document).** Đây là nguồn sự thật ngắn gọn về hệ thống: đang làm gì, làm thế nào, đã quyết định gì, đang ở đâu.
> Cập nhật file này **mỗi lần có thay đổi đáng kể** (tính năng, schema, API, hạ tầng, quyết định), rồi đưa bản mới vào Project "gia phả" trên claude.ai để Claude đọc lại ở các phiên sau.

| Mục | Giá trị |
| --- | --- |
| Phiên bản file | 0.16.0 |
| Cập nhật lần cuối | 2026-11-09 |
| Người cập nhật | TuanLC, Claude |
| Giai đoạn hiện tại | **MVP phần 2: website công khai, thống kê truy cập, lời nhắn của khách, thư viện ảnh theo album, nhập phả từ Excel, in phả đồ PDF/SVG xong; chịu tải đông người xem (bộ nhớ đệm, nén). Tiếp theo: ứng dụng iOS/Android** |
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

Hệ thống gia phả online. **Hiện dùng riêng cho MỘT dòng họ** (chốt 2026-11-01, `CLAN_MODE=single`); kiến trúc vẫn giữ
khả năng đa dòng họ (RLS theo `clan_id`) để sau này mở thành dịch vụ mà không phải viết lại. Dòng họ có:
- Trang quản trị: dựng phả đồ, quản lý thành viên, bài viết, sự kiện, thư viện, người dùng, thống kê truy cập.
- Website công khai riêng (subdomain hoặc tên miền riêng): phả ký, phả đồ, tin tức, thư viện, lịch giỗ, bản đồ, **thông tin liên hệ ban quản lý**, bộ đếm truy cập.
- Trên điện thoại: **PWA** (cài từ trình duyệt) và **app iOS/Android** đóng gói cùng mã web bằng Capacitor (ADR-012): xem cây, tra xưng hô, nhận nhắc ngày giỗ.
- Super-admin quản lý toàn nền tảng (chỉ cần khi chuyển sang nhiều dòng họ).

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
| MVP phần 1 — Phả đồ, thành viên (tuần 3–8) | **Xong phần chính (2026-11-02)** | Đăng nhập email/số điện thoại, tạo dòng họ, phả đồ, thêm/sửa/xoá người, danh sách, xưng hô, mời/duyệt thành viên, vai trò, ảnh, trang chủ, lịch giỗ, PWA, demo Docker — 118 test API + 24 test trình duyệt. Nhập phả đầy đủ xong 0.11.0 |
| MVP phần 2 — Website, sự kiện, xuất, thống kê, liên hệ (tuần 9–14) | **Đang làm** | Xong: website công khai + ban liên lạc (0.12), thống kê truy cập, lời nhắn của khách, ảnh xem trước khi chia sẻ link, tối ưu đông người dùng (0.14), thư viện ảnh theo album (0.15), nhập Excel + in PDF/SVG + xuất danh sách (0.16) — 170 test API + 27 test trình duyệt. Còn: sự kiện họp họ |
| Phase 2 (tuần 15–24), Phase 3 (tuần 25–32) | Chưa bắt đầu | |

### 2.2. Việc đang làm
- (trống)

### 2.3. Việc tiếp theo (thứ tự chủ dự án đã chốt)
1. ~~Lịch giỗ~~ — xong 0.10.0 (còn: nhắc qua email khi có SMTP, sự kiện họp họ/chạp mả).
2. ~~Hoàn thiện nhập phả~~ — xong 0.11.0 (còn: tiểu sử định dạng chữ đậm/nghiêng, ảnh trong tiểu sử; nhánh/chi).
3. ~~Website công khai + thông tin liên hệ~~ — xong 0.12.0; ~~thống kê truy cập, form gửi lời nhắn, ảnh xem trước khi chia sẻ link, chịu tải đông người~~ — xong 0.14.0. Còn: nội dung trang công khai cho máy tìm kiếm (Google) vẫn dựng phía trình duyệt; Turnstile cho form lời nhắn khi bị spam.
3b. ~~Thư viện ảnh theo album~~ — xong 0.15.0 (còn: video, tài liệu PDF, gắn người vào ảnh, thành viên thường tự đóng góp ảnh). ~~Nhập Excel / xuất PDF~~ — xong 0.16.0 (còn: xuất ảnh PNG, GEDCOM, sao lưu tải về).
4. Ứng dụng iOS/Android (Capacitor bọc PWA).
4. Sửa bảng xưng hô riêng của dòng họ (KI-013); "Tôi gọi người này là gì?" từ người đã gắn "Đây là tôi".
5. (Tuỳ chọn) chuyển kho GitHub về riêng tư. Chốt các câu hỏi còn lại ở mục 3.2.

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
- Prisma 6.19 chỉ để quản lý schema/migration (ADR-008); API truy vấn bằng **Kysely** + NestJS 12 (ADR-010); 3 role DB: `coinguon` (migration), `coinguon_app` (bị RLS), `coinguon_platform` (BYPASSRLS) — ADR-009.

- **Chốt 2026-11-01 (chủ dự án trả lời):**
  - Dùng riêng cho **một dòng họ** → `CLAN_MODE=single` (ADR-011). Chưa làm thu phí, gói cước.
  - Máy chủ ở **Việt Nam** (Bizfly / Viettel IDC / VNPT). Ngân sách: **0 USD khi demo**, **~10 USD/tháng khi chạy thật** (ADR-007 sửa đổi).
  - Xưng hô mặc định **miền Trung** (`kinship_variant` mặc định `trung`, ADR-013).
  - Dữ liệu thử: **dữ liệu giả** (`pnpm --filter @coinguon/api seed`); chủ dự án bổ sung dữ liệu thật sau.
  - Điện thoại: làm **cả PWA, app Android và app iOS** (ADR-012).

### 3.2. Chưa chốt (cần chủ dự án trả lời)
- [ ] Tên miền (cần tra cứu nhãn hiệu trước).
- [ ] Phí cửa hàng ứng dụng: Apple Developer 99 USD/năm, Google Play 25 USD một lần — vượt ngân sách ~10 USD/tháng; chủ dự án quyết định khi đến bước phát hành app.
- [ ] Bảng xưng hô miền Trung cần người trong họ duyệt (KI-001) — mỗi vùng gọi khác nhau.
- [x] Tên sản phẩm: Gia Phả Cội Nguồn.

---

## 4. Công nghệ

| Lớp | Công nghệ |
| --- | --- |
| Web (quản trị + website + PWA) | Next.js (App Router), React, Tailwind CSS, shadcn/ui |
| Phả đồ | React Flow + layout tự viết (Reingold–Tilford/Walker) trong Web Worker; chế độ Canvas khi thu nhỏ |
| API | NestJS 12 (ESM, REST) + Kysely 0.29 (SQL có kiểu, sinh kiểu bằng `kysely-codegen`); Argon2id (`@node-rs/argon2`) |
| Validation dùng chung | Zod (`packages/schemas`) |
| Schema / DB | Prisma (schema + migration) / PostgreSQL 16 (ltree, pg_trgm, unaccent, RLS) |
| Cache, hàng đợi, bộ đếm | Redis + BullMQ |
| File | Cloudflare R2 (S3-compatible), upload trực tiếp bằng presigned URL |
| Xuất file | ExcelJS (nhập/xuất Excel); PDFKit + fontkit vẽ phả đồ PDF/SVG ngay trong API (ADR-020) — không cần Chromium |
| Reverse proxy | Caddy (SSL tự động, on-demand TLS cho tên miền riêng) |
| Test | Vitest, Supertest, Testcontainers, Playwright, k6 |
| Vận hành | Docker, GitHub Actions, Sentry, Uptime Kuma |

---

## 5. Kiến trúc

**Triển khai thật (~10 USD/tháng, ADR-007):** 1 VPS Bizfly Cloud 4 GB RAM / 40 GB SSD (~240.000 đ/tháng chưa VAT, tra 2026-11-01)
chạy Docker Compose: Caddy, web, api, worker, PostgreSQL, Redis. **Không dùng R2/MinIO lúc đầu**: ảnh lưu trên ổ VPS (volume `media`),
sao lưu hằng đêm (`pg_dump` + ảnh) sang Google Drive miễn phí bằng rclone. Cloudflare gói miễn phí cho DNS/CDN.
**Demo (0 USD):** chạy Docker Compose trên máy cá nhân + Cloudflare Tunnel miễn phí để có đường link chia sẻ.

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
├── apps/
│   ├── api/                 # ✅ @coinguon/api — NestJS + Kysely: src/{auth,clans,persons,tree,common,db}, seed.ts, test/*.e2e.test.ts
│   ├── web/                 # ✅ @coinguon/web — Next.js 16 + Tailwind 4 + TanStack Query: app/, components/{tree,…}, lib/, e2e/ (Playwright); PWA
│   ├── mobile/              # (sau) Capacitor bọc web thành app iOS/Android (ADR-012)
│   └── worker/              # (MVP phần 2) BullMQ
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
| common | SessionGuard (cookie + CSRF), TenantGuard (`withClan` đặt `app.clan_id`, vai trò `@MinRole`), ErrorFilter, audit | NFR-SEC | **Xong** (chưa có rate limit — KI-010) |
| auth | Đăng ký, đăng nhập, OTP, 2FA, Google | FR-AUTH | **Email + mật khẩu xong** (khoá 15 phút sau 5 lần sai); OTP/2FA/Google chưa |
| clans, members | Dòng họ, mời, vai trò, phạm vi chi | FR-CLAN | **Xong** (2026-11-02): tạo/sửa dòng họ, link mời (vai trò, hạn, số lượt, theo email, gắn người), đổi vai trò, xoá thành viên, "Đây là tôi"; phạm vi chi chưa (KI-011) |
| persons, unions, tree | CRUD người/quan hệ, cây có cache, mã xem | FR-TREE, FR-PERSON | **API xong**: CRUD, thêm con/vợ chồng/cha mẹ, sắp thứ tự con, tìm không dấu, `GET /tree` có bố cục; cache cây & mã xem chưa |
| kinship | Tra xưng hô | FR-KIN | **API xong** (`GET /kinship`, hai chiều); bảng chưa duyệt (KI-001) |
| events | Sự kiện, lịch giỗ, nhắc | FR-EVENT | Logic lõi xong (`lunar-vn`); API, job chưa làm |
| import-export | Nhập Excel (kiểm tra → xác nhận → hoàn tác 24 h), xuất danh sách Excel, in phả đồ PDF/SVG | FR-IO | Xong 0.16.0 (còn: PNG, sao lưu tải về, GEDCOM P2) |
| media, albums | Thư viện ảnh theo album | FR-MEDIA | Xong 0.15.0 (chỉ ảnh) |
| posts, places | Bài viết, bản đồ | FR-CONTENT, FR-GRAVE | Chưa làm |
| site-settings, contacts, domains | Website, liên hệ ban quản lý, tên miền | FR-SITE | Chưa làm |
| analytics | Heartbeat, page view, online realtime (SSE), báo cáo ngày | FR-STAT | Chưa làm |
| audit, trash | Nhật ký, thùng rác | FR-ADMIN | Chưa làm |
| platform, billing | Super-admin, gói cước (P3), quyền hỗ trợ có thời hạn, ẩn nội dung vi phạm | FR-PLAT | Chưa làm |
| help (apps/web) | Trang Trợ giúp `/tro-giup` render `content/help/*.md` | — | **Xong** (mục lục tự động, ẩn frontmatter/ghi chú) |
| web: phả đồ | `TreeCanvas` (SVG, kéo/chụm/cuộn, lề "Đời n", chỉ vẽ phần nhìn thấy khi > 300 người), `PersonPanel` (xem/sửa/thêm/xoá), `PersonForm` (ngày âm/dương, khoảng năm, tháng nhuận) | FR-TREE | **Xong** |
| web: PWA | `app/manifest.ts`, `public/sw.js` (không cache `/api`), trang offline, icon | NFR | **Xong**; app iOS/Android (Capacitor) chưa |

---

## 10. API — quy ước & endpoint chính

- Tiền tố `/api/v1`; cookie phiên `sid` + header `X-CSRF-Token`; lỗi `{code, message, details}`; phân trang `{items,total,page,pageSize}`.
- Endpoint nghiệp vụ dưới `/clans/:clanId/...`; công khai dưới `/public/sites/:host/...`; thu thập thống kê `/t/pv`, `/t/hb`.
- Mới (2026-11-01): `/clans/:clanId/contacts`, `/contacts/:id/consent`, `/analytics/live`, `/analytics/live/stream` (SSE), `/analytics/daily`, `/analytics/breakdown`, `/analytics/export`, `/public/sites/:host/counters`, `/public/sites/:host/contact-messages`.
- Danh sách đầy đủ: tài liệu đặc tả mục 9.

**Đã chạy được (v0.4.0)** — mọi request ghi cần header `X-CSRF-Token` = cookie `csrf`:

| Method & đường dẫn | Quyền | Ghi chú |
| --- | --- | --- |
| `GET /health` | công khai | healthcheck |
| `GET /instance` | công khai | `{clanMode, clan: {id,name,slug,surname} \| null}` — web biết cần "tạo dòng họ" hay vào thẳng |
| `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` | công khai / đã đăng nhập | register `{name, password, phone?, email?}` (ít nhất một); login `{identifier, password}` (identifier = email hoặc số điện thoại; vẫn nhận `email`); trả `{user {id,email,phone,name}, csrfToken}`; lỗi `EMAIL_TAKEN`/`PHONE_TAKEN` 409 (details theo ô), `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED` (423) |
| `GET /instance/join-request` · `POST` | đã đăng nhập | chế độ single: yêu cầu tham gia của tôi `{request: {status, message, createdAt, decidedAt} \| null}`; POST `{message?}` (gửi lại sau khi bị từ chối → chờ duyệt lại); `ALREADY_MEMBER` 409, `NO_MAIN_CLAN` 404 |
| `GET /clans/:clanId/join-requests` · `POST …/:id/approve` `{role, personId?}` · `POST …/:id/reject` | admin | duyệt người tự đăng ký; `REQUEST_DECIDED` 409 |
| `POST /clans/:clanId/members` | admin | tạo tài khoản mới `{name, phone?, email?, role, personId?}` → `{member, setPassword {path, expiresAt}}` (link đặt mật khẩu 7 ngày); số/email đã có tài khoản → `PHONE_TAKEN`/`EMAIL_TAKEN` (không gắn tài khoản có sẵn) |
| `GET /clans/:clanId/anniversaries?from=YYYY-MM-DD&days=1..800` | member | `{from, days, items[{personId, fullName, generation, inClan, deathYear, lunar, solarDate, weekday, daysUntil, nth, adjustments}], missingDeathDay}`; mặc định từ hôm nay giờ VN, 365 ngày; người `hidden` chỉ admin thấy |
| `GET /clans/:clanId/anniversaries.ics?years=1..5` | member | file lịch RFC 5545, sự kiện cả ngày, nhắc trước 3 ngày; tên file `lich-gio-<slug>.ics` |
| `GET /me`, `GET /me/clans` | đã đăng nhập | |
| `POST /auth/forgot-password` | công khai | `{email}` → luôn 202 (không lộ email có tài khoản); gửi link 30 phút qua SMTP hoặc ghi log |
| `POST /auth/reset-password` | công khai | `{token, password}` → `{email}`; dùng một lần, mở khoá tài khoản, xoá mọi phiên; `RESET_LINK_INVALID` 410 |
| `POST /clans/:clanId/members/:memberId/password-reset` | admin | link 24 giờ `{path, expiresAt}` cho thành viên vai trò thấp hơn (`USE_FORGOT_PASSWORD` nếu là chính mình) |
| `POST /clans` | đã đăng nhập | người tạo = owner; `SLUG_TAKEN`; chế độ single đã có dòng họ → `SINGLE_CLAN_EXISTS` |
| `GET /clans/:clanId`, `PATCH /clans/:clanId` | member / admin | đổi `rootPersonId`/`lineageMode` → tính lại đời |
| `GET /clans/:clanId/persons?q&generation&living&page&pageSize` | member | tìm không dấu; người `hidden` chỉ admin thấy |
| `GET/POST/PATCH/DELETE /clans/:clanId/persons[/:personId]` | member xem, editor sửa | người có `otherNames[{type huy\|tu\|thuy\|hieu\|khac, value}]`, `facts {birthPlace, burialPlace, occupation}` (bảng `person_facts`; gửi null/rỗng để xoá), `biography {text} \| null`; chi tiết thêm `childOf[{unionId, relation, birthOrder, siblings, parents}]`, `unions[].isPartnerA`. PATCH cần `version` → `PERSON_VERSION_CONFLICT`; DELETE có con cần `?confirm=true` (`HAS_DESCENDANTS`), không xoá thuỷ tổ (`IS_ROOT_PERSON`) |
| `POST /clans/:clanId/persons/:id/children` · `/spouses` · `/parents` | editor | `UNION_REQUIRED` khi nhiều hôn phối, `SELF_UNION`, `ALREADY_SPOUSES`, `HAS_PARENTS` |
| `PUT /clans/:clanId/unions/:unionId/children/order` | editor | `CHILD_LIST_MISMATCH` |
| `PUT /clans/:clanId/persons/:personId/parent-link` | editor | `{parentId, unionId?, relation}` — gắn/chuyển cha mẹ hoặc đổi ruột/nuôi/riêng; `step` thêm bên cạnh cha mẹ ruột, ruột/nuôi thay cha mẹ cũ (đánh số lại anh chị em cũ, bỏ cặp "chưa rõ" rỗng); trả chi tiết người; `UNION_REQUIRED`, `SELF_PARENT`, `IS_ROOT_PERSON`, `ANCESTOR_CYCLE` |
| `PUT /clans/:clanId/persons/:personId/unions/order` | editor | `{unionIds}` vợ cả trước; chỉ cặp người này là `partner_a`; `UNION_LIST_MISMATCH` |
| `DELETE /clans/:clanId/unions/:unionId` | editor | gỡ hôn phối nhập nhầm (xoá hẳn, người giữ nguyên); `UNION_HAS_CHILDREN` 409 |
| `GET /clans/:clanId/tree?rootId&depth&orientation&collapsed` | member | `{rootId, nodes[{personId,x,y,width,height,depth,isSpouse,hasHiddenChildren,person}], edges, width, height}` |
| `GET /clans/:clanId/kinship?a&b` | member | `{related, aCallsB, bCallsA, kind, side, generationGap, viaMarriage, path}` |
| `GET /clans/:clanId/members` · `PATCH/DELETE …/members/:memberId` | admin | đổi `role`/`personId`; chỉ quản lý người vai trò thấp hơn (`ROLE_TOO_LOW`, `CANNOT_CHANGE_OWN_ROLE`, `CANNOT_REMOVE_SELF`) |
| `PATCH /clans/:clanId/me/person` | member | "Đây là tôi" `{personId \| null}`; `PERSON_ALREADY_LINKED` |
| `GET/POST /clans/:clanId/invitations` · `DELETE …/invitations/:id` | admin | tạo `{role, email?, personId?, expiresInDays 1–30, maxUses 1–100}` → trả `token` **một lần**; không cấp được `owner` |
| `POST /clans/:clanId/media` | editor | multipart `file` (+ `caption`); trả `{id, width, height, caption, urls:{sm,md,lg,orig}}`; lỗi `FILE_REQUIRED`, `UNSUPPORTED_IMAGE` 422, `FILE_TOO_LARGE` 413 |
| `GET /clans/:clanId/media` · `GET …/media/:id/:variant` | member | thư viện ảnh; tải file theo cỡ `sm` (vuông 320) / `md` 960 / `lg` 1920 (WebP) / `orig` (JPEG/PNG, tải về) — `Cache-Control: private, immutable` |
| `PATCH/DELETE /clans/:clanId/media/:id` | editor | sửa chú thích; xoá (gỡ khỏi ảnh chân dung, banner tự bỏ, xoá file sau commit) |
| `PUT /clans/:clanId/persons/:id/avatar` | editor | `{mediaId \| null}` — không tăng `version`; ảnh phải cùng dòng họ (`MEDIA_NOT_FOUND`) |
| `GET /clans/:clanId/site/home` · `PUT` (admin) | member | `{banners[], couplet {left,right} \| null, motto, templeAddress, stats {people, generations}}`; lưu trong `site_settings.data.home` |
| `GET /public/site` | công khai | chế độ single: `{clan, home {banners[{id, urls sm/md/lg}], couplet, motto, templeAddress}, stats {people, generations} (người đã mất công khai), contacts[{name, role, phone, email}]}`; multi → `NO_PUBLIC_SITE` 404 |
| `GET /public/tree` · `GET /public/persons/:id` · `GET /public/anniversaries?days` | công khai | chỉ người **đã mất** + `privacy = public` (ADR-017); người thân không công khai bị lược; hồ sơ không có `version`, `privacy` |
| `GET /public/media/:id/:variant` | công khai | chỉ `sm/md/lg` (không ảnh gốc), chỉ ảnh banner hoặc chân dung người công khai; `Cache-Control: public, max-age=86400` |
| `POST /t/pv` · `POST /t/hb` | công khai | thống kê: `{h, v (mã khách 10–32 ký tự), p (đường dẫn, bỏ query), m 0/1, r? (nguồn), pid? (người đang xem)}` → luôn 204; bot (theo user-agent) bị bỏ qua; giới hạn 3000/5 phút/IP |
| `GET /public/stats` | công khai | `{online, today, total}` — nhớ 30 giây |
| `GET /clans/:clanId/albums` | member | `{albums[{id, title, description, visibility, coverId, createdAt, count, cover, lastAddedAt}], loose{count}}` — album có ảnh mới lên trước; bìa = ảnh đã chọn, không thì ảnh đầu |
| `POST /clans/:clanId/albums` · `PATCH …/albums/:id` | editor | `{title 1–120, description? ≤2000, visibility public\|members (mặc định members), coverId? (phải là ảnh trong album → 422 COVER_NOT_IN_ALBUM)}` |
| `GET /clans/:clanId/albums/:id` · `GET …/albums/anh-le` | member | `{album, photos[MediaItem]}` — ảnh cũ trước; `anh-le` = ảnh chưa xếp album (album: null) |
| `DELETE /clans/:clanId/albums/:id?xoaAnh=1` | editor | mặc định giữ ảnh (về ảnh lẻ); `xoaAnh=1` xoá luôn ảnh (file xoá sau khi commit) |
| `POST /clans/:clanId/media/move` | editor | `{mediaIds[1..500], albumId \| null}` → `{moved}`; ảnh bìa bị chuyển đi thì album tự lấy ảnh đầu |
| `POST /clans/:clanId/media` (trường `albumId`) | editor | tải thẳng vào album |
| `GET /clans/:clanId/import/template.xlsx` | member | file mẫu: trang Danh sách (trống), Ví dụ, Hướng dẫn |
| `POST /clans/:clanId/imports` (multipart `file`, ≤10 MB, ≤5.000 dòng) | admin | **chỉ kiểm tra**, lưu kết quả: `{id, ok, fileName, summary{newPeople, skippedExisting, newUnions, links, deceased, generations[min,max], rootName}, errorCount, errors[{row, column, message}], warnings}` (tối đa 200 lỗi hiện ra); 30 lần/giờ |
| `GET /clans/:clanId/imports` · `GET …/imports/:id` · `GET …/imports/:id/errors.xlsx` | admin | lịch sử 30 lần gần nhất (`status` checked/failed/done/reverted, `canRevert`, `revertUntil`); file đánh dấu lỗi (ô sai tô đỏ + ghi chú, cột "Lỗi cần sửa") |
| `POST …/imports/:id/commit` | admin | khoá dòng (bấm 2 lần không nhập trùng); **kiểm tra lại với dữ liệu hiện tại** → 409 `IMPORT_STALE` nếu phả đã đổi; ghi theo lô 500 dòng; 409 `IMPORT_ALREADY_DONE`, `IMPORT_HAS_ERRORS`, `IMPORT_EXPIRED` (>24 h) |
| `POST …/imports/:id/revert` | admin | trong 24 h; 409 `IMPORT_REVERT_BLOCKED` nếu đã có người nối thêm vào người vừa nhập |
| `GET /clans/:clanId/export/persons.xlsx` | editor | danh sách đúng mẫu nhập (Mã = id), người "ẩn" chỉ admin thấy đủ |
| `GET /clans/:clanId/export/tree.pdf` · `tree.svg` · `tree-info` | member | `rootId?, depth?, paper=A4…A0\|cuon, layout=tu-dong\|mot-trang\|nhieu-trang, anh=0\|1`; `tree-info` → `{people, generations, pages, cols, rows, pageWidthCm, pageHeightCm, nameHeightMm, readable}`; 30 lần/10 phút |
| `GET /public/albums` · `GET /public/albums/:id` | công khai | chỉ album `public` có ảnh; ảnh chỉ cỡ sm/md/lg (không ảnh gốc); ảnh trong album công khai được phép qua `/public/media` |
| `POST /public/messages` | công khai | lời nhắn `{name, replyTo (số điện thoại hoặc email), message 5–4000, website? (ô bẫy — có chữ thì bỏ qua, vẫn 204)}` → 204, email báo quản trị (nếu có SMTP); 10 lần/giờ/IP |
| `GET /clans/:clanId/messages?status=open\|all` · `PATCH …/:id {handled}` · `DELETE …/:id` | admin | `{items[{id, name, replyTo, message, createdAt, handledAt}], open}` (200 mới nhất) |
| `GET /clans/:clanId/stats/live` | admin | `{online, guests, members, pages[{path, online}], at}` — khách gửi tín hiệu trong 90 giây |
| `GET /clans/:clanId/stats/daily?from&to` | admin | ≤ 366 ngày: `{days[{date, pageViews, uniqueVisitors, memberViews}], allTimeViews, pages, referrers, devices, persons[{key, views, fullName}]}` (đường dẫn gộp `/dong-ho/:id/...`) |
| `GET/POST /clans/:clanId/contacts` · `PATCH/DELETE …/:id` · `PUT …/order` | admin | ban liên lạc `{name, role, phone?, email?, showPhone, showEmail, consent, consentNote?}`; bật hiện mà chưa `consent` → 422; trang công khai chỉ hiện trường bật + đã đồng ý |
| `GET /invitations/:token` | công khai | xem trước `{clanId, clanName, role, invitedBy, expiresAt, forSpecificEmail, status}` |
| `POST /invitations/:token/accept` | đã đăng nhập | `{clanId, alreadyMember, role}` (đã là thành viên → giữ vai trò cũ, không tốn lượt); đóng yêu cầu tham gia đang chờ; lỗi `INVITE_NOT_FOUND` 404, `INVITE_EXPIRED`/`INVITE_REVOKED`/`INVITE_USED` 410, `INVITE_EMAIL_MISMATCH` 403 |

Không phải thành viên → **404** (không lộ dòng họ có tồn tại). Mã lỗi DB: trigger `ANCESTOR_CYCLE`/`SELF_PARENT`/`CROSS_CLAN_REFERENCE` → 422.

**Bộ nhớ đệm & nén (0.14.0, ADR-018):** `GET …/tree`, `GET …/anniversaries`, mọi `GET /public/*` trả `ETag`; gửi lại `If-None-Match` → **304**. Thành viên: `Cache-Control: private, no-cache`; công khai: `public, no-cache` (trình duyệt luôn hỏi lại → sửa xong thấy ngay). Phản hồi ≥ 1 KB nén `br`/`gzip` theo `Accept-Encoding` (phả đồ 2.000 người: 1 MB → 108 KB). Ghi thành công dưới `/clans/:clanId` → bỏ toàn bộ kết quả nhớ của dòng họ đó.

---

## 11. Thống kê truy cập (tóm tắt) — đã chạy (0.14.0, ADR-019)

- Trình duyệt (`apps/web/components/visit-tracker.tsx`, gắn ở layout gốc): mã khách ngẫu nhiên trong `localStorage` (`coinguon:khach`, không cookie, không gắn tài khoản); `fetch keepalive` `/t/pv` mỗi lần đổi trang (kèm nguồn ở lần đầu, `pid` khi mở hồ sơ `?nguoi=`), `/t/hb` 30 giây/lần khi tab đang hiện. `m=1` khi có cookie `csrf` (đã đăng nhập).
- API (`AnalyticsService`): **gom trong bộ nhớ**, cứ 60 giây (và khi tắt máy chủ, khi quản trị mở báo cáo) cộng dồn vào `analytics_daily` / `analytics_dims` (page, person, referrer, device; tối đa 2.000 khoá/ngày). Ghi lỗi → giữ số đếm, lần sau ghi tiếp.
- Đang xem = mã khách có tín hiệu trong 90 giây (bộ nhớ). Khách duy nhất trong ngày: tập bản băm mã khách theo ngày trong bộ nhớ (khởi động lại giữa ngày có thể đếm thêm — KI-029).
- Ngày thống kê theo giờ Việt Nam (`statDateVN`). Không lưu IP; không đếm bot (`isBotUserAgent`, gồm `facebookexternalhit`).
- Web: thẻ **Thống kê** (quản trị) — đang xem (tự làm mới 30 giây), lượt xem theo ngày (cột, rê chuột xem số, có bảng số liệu), trang / người / nguồn / thiết bị xem nhiều; bộ đếm nhỏ cuối trang công khai (trang chủ, liên hệ).
- Chưa dùng Redis (thiết kế cũ ở ADR-004/005): một bản API là đủ; cần nhiều bản API thì chuyển sang Redis (KI-028).

---

## 12. Bảo mật & riêng tư (bắt buộc)

- RLS + TenantGuard; test phân tách tenant chạy trong CI (TC-SEC-01).
- Argon2id, 2FA cho owner/super-admin, khoá tạm sau 5 lần sai, rate limit mã xem phả đồ 10 lần/15 phút/IP.
- Tuân thủ Luật BVDLCN 91/2025/QH15 + NĐ 356/2025/NĐ-CP: riêng tư mặc định, đồng ý trước khi công khai liên hệ, quyền xem/sửa/xoá dữ liệu.
- Sở hữu trí tuệ: không sao chép web tham chiếu; chỉ dùng thư viện MIT/Apache/BSD/ISC; không GPL/AGPL/"non-commercial".
  Ngoại lệ đã xem xét (ghi trong `scripts/check-licenses.mjs`): font OFL-1.1 (Alegreya, Be Vietnam Pro), `caniuse-lite` CC-BY-4.0 (dữ liệu lúc build),
  `@img/sharp-libvips-*` LGPL-3.0 (thư viện ảnh tuỳ chọn của Next.js, liên kết động, không sửa).

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
pnpm khoi-tao                        # lần đầu: .env, migration, build, dữ liệu mẫu (scripts/setup-local.mjs)
pnpm dev                             # API + web cùng lúc (turbo, chạy được trên Windows)
pnpm --filter @coinguon/api dev      # API tại http://localhost:4000/api/v1 (cần APP_DATABASE_URL, PLATFORM_DATABASE_URL)
pnpm --filter @coinguon/api db:types # sinh lại src/db/generated.ts sau khi đổi schema
pnpm --filter @coinguon/api seed     # dữ liệu GIẢ ~60 người (chỉ chạy khi chưa có dòng họ); in ra email/mật khẩu
pnpm --filter @coinguon/web dev      # giao diện tại http://localhost:3000 (gọi API qua /api/v1)
pnpm --filter @coinguon/web test:e2e # Playwright: tự chạy API + web, DB riêng coinguon_e2e (cần pnpm build trước)
node scripts/check-licenses.mjs      # kiểm tra giấy phép mọi gói production
```

Test DB tích hợp: `packages/db` dùng `TEST_DATABASE_URL`, `TEST_APP_DATABASE_URL`, `TEST_PLATFORM_DATABASE_URL` (DB `coinguon_test`);
`apps/api` dùng DB riêng `coinguon_test_api` qua `TEST_API_DATABASE_URL`, `TEST_API_APP_DATABASE_URL`, `TEST_API_PLATFORM_DATABASE_URL`
(mặc định localhost) để hai bộ test chạy song song không đụng nhau. Tạo DB: `CREATE DATABASE coinguon_test_api` → `migrate:deploy` (hoặc `migrate:sql`) → chạy `infra/docker/postgres/init.sql`.

---

## 15. Biến môi trường (dự kiến)

| Biến | Dùng cho |
| --- | --- |
| CLAN_MODE | `single` (mặc định — một dòng họ) / `multi` |
| SEED_EMAIL, SEED_PASSWORD | Tài khoản cho dữ liệu mẫu (`seed`) |
| PUBLIC_URL | Địa chỉ web công khai: link trong email (API) và **ảnh xem trước khi chia sẻ link** (web). `pnpm chay` tự đặt theo link Quick Tunnel rồi khởi động lại api + web |
| DB_POOL_MAX | (API) số kết nối Postgres tối đa, mặc định 20 |
| CACHE_MAX_MB, CACHE_TTL_SEC | (API) bộ nhớ đệm phả đồ / lịch giỗ / trang công khai: dung lượng (mặc định 64 MB, `0` = tắt) và thời hạn tối đa (600 giây — phòng dữ liệu bị sửa ngoài API) |
| PG_MAX_CONNECTIONS, PG_SHARED_BUFFERS, PG_EFFECTIVE_CACHE_SIZE, PG_WORK_MEM | (compose.prod) cấu hình Postgres, mặc định cho VPS 2 GB: 100 / 256MB / 768MB / 8MB |
| UV_THREADPOOL_SIZE | (Dockerfile API) 8 — băm mật khẩu, nén, đọc ảnh song song |
| SMTP_URL, SMTP_FROM | Gửi email (vd. `smtps://ten%40gmail.com:matkhauungdung@smtp.gmail.com:465`); trống = chỉ ghi log |
| TRUST_PROXY | Express "trust proxy", mặc định `loopback, linklocal, uniquelocal` (tin các bước chuyển tiếp nội bộ) |
| CLIENT_IP_HEADER | Header IP thật do proxy tin cậy gắn, vd. `cf-connecting-ip` sau Cloudflare Tunnel |
| RATE_LIMIT | `on` (mặc định) / `off` (chỉ dùng trong test) |
| DB_PASSWORD, APP_DB_PASSWORD, PLATFORM_DB_PASSWORD | (compose.prod) mật khẩu 3 role CSDL — `pnpm demo` tự sinh vào `.env.demo` |
| DOMAIN | (compose.prod, profile `caddy`) tên miền hoặc `<IP-gạch-nối>.sslip.io` |
| BACKUP_HOUR, BACKUP_KEEP_DAYS | Giờ sao lưu hằng ngày (mặc định 2) và số ngày giữ (14) |
| API_ORIGIN | (web) địa chỉ API mà Next chuyển tiếp `/api/v1` tới, mặc định `http://localhost:4000` |
| DATABASE_URL | PostgreSQL — role chủ, chạy migration |
| APP_DATABASE_URL | Role `coinguon_app` (bị RLS) — dùng trong api/web |
| PLATFORM_DATABASE_URL | Role `coinguon_platform` (BYPASSRLS) — worker, super-admin |
| MEDIA_DIR | Thư mục lưu ảnh (mặc định `data/media` theo thư mục chạy API; `.env.example`: `../../data/media`; production: volume Docker) |
| MEDIA_MAX_MB | Dung lượng tối đa mỗi ảnh tải lên, mặc định 15 |
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
| ADR-007 | 2026-11-01 (sửa) | Một VPS **ở Việt Nam** (Bizfly Cloud 4 GB ~240.000 đ/tháng) + Docker Compose + Caddy; ảnh lưu ổ đĩa VPS, sao lưu sang Google Drive; demo chạy máy cá nhân + Cloudflare Tunnel | Ngân sách ~10 USD/tháng, dữ liệu ở trong nước, chủ dự án chọn | Viettel IDC (gói 4 GB ~599.000 đ/tháng — vượt ngân sách), Singapore, R2 |
| ADR-008 | 2026-11-01 | Prisma 6.19 (chưa lên 7/8) | Ổn định, ít thay đổi cấu hình; Prisma 7 bắt buộc driver adapter + prisma.config.ts — cân nhắc nâng cấp khi làm api | Prisma 7.10, Drizzle |
| ADR-016 | 2026-11-02 | Triển khai bằng **một bộ Docker Compose** (`infra/docker/compose.prod.yml`): db, migrate (một lần), api, web, backup (pg_dump + ảnh hằng đêm), profile `tunnel` (Cloudflare Quick Tunnel — demo 0 đ trên máy cá nhân) và `caddy` (HTTPS tự động cho VPS/Oracle Free, tên miền hoặc `sslip.io`). Migration chạy bằng `migrate.mjs` ghi `_prisma_migrations` y hệt Prisma | Chủ dự án muốn demo miễn phí trước; cùng cấu hình dùng lại cho Bizfly; không phụ thuộc tải engine Prisma lúc triển khai (CI kiểm tra `prisma migrate status` công nhận) | Render/Fly free tier (ngủ, mất ổ đĩa), Supabase/Neon (không tạo được role BYPASSRLS dễ dàng) |
| ADR-015 | 2026-11-02 | Ảnh: xử lý bằng `sharp` (xoay theo EXIF rồi **bỏ toàn bộ metadata/GPS**, tạo cỡ sm/md/lg WebP + bản gốc JPEG/PNG), lưu **ổ đĩa** `MEDIA_DIR/{clanId}/{mediaId}/`, phục vụ qua API dưới `/clans/:clanId/media/...` để RLS + TenantGuard kiểm quyền. Banner/câu đối lưu trong `site_settings.data.home` | Ngân sách ~10 USD/tháng (không R2); ảnh gia đình là dữ liệu riêng tư; lớp `MediaStorage` đổi được sang S3/R2 sau | Cloudflare R2 + URL ký sẵn; Next Image optimizer (không gửi cookie khi tải ảnh cần đăng nhập) |
| ADR-014 | 2026-11-02 | Lời mời bằng link: mã ngẫu nhiên 18 byte, DB chỉ lưu sha256; tra theo mã dùng role `coinguon_platform` (BYPASSRLS) vì người nhận chưa có ngữ cảnh dòng họ — chỉ khớp đúng `token_hash`, mọi ghi đều qua `withClan` | Không thể đặt `app.clan_id` trước khi biết lời mời thuộc dòng họ nào; FORCE RLS chặn cả hàm SECURITY DEFINER | Hàm SECURITY DEFINER + bỏ FORCE RLS; mã chứa clan_id |
| ADR-013 | 2026-11-01 | Xưng hô mặc định miền Trung: ba/mạ, chị-em gái của cha là "o", chồng o/dì là "dượng" | Chủ dự án chọn; bảng tạm, sẽ cho dòng họ tự sửa (KI-013) | Bắc làm mặc định |
| ADR-012 | 2026-11-01 | Điện thoại: PWA trước, rồi **Capacitor** đóng gói chính web app thành app iOS/Android, thêm tính năng gốc (thông báo đẩy ngày giỗ, chụp ảnh, xem offline) | Một mã nguồn, chi phí thấp; App Store yêu cầu app có tính năng gốc, không chỉ bọc web | React Native/Expo (viết lại giao diện), Flutter |
| ADR-017 | 2026-11-02 | Website công khai: chỉ người đã mất + `privacy = public`; không mật khẩu xem chung; ảnh công khai không có bản gốc; trang công khai dựng phía trình duyệt (chưa SSR); từ 0.14.0 phần đầu trang (tên, mô tả, ảnh xem trước Open Graph) dựng sẵn trên máy chủ | Chủ dự án chốt; bảo vệ người còn sống; làm nhanh, SEO để sau | Hiện cả tên người còn sống; mã xem chung |
| ADR-018 | 2026-11-09 | **Chịu tải đông người xem**: bộ nhớ đệm trong tiến trình API (`ResponseCache`) cho phả đồ, lịch giỗ, mọi trang `/public/*` — khoá gồm "phiên bản" của dòng họ, tăng sau mỗi ghi thành công (interceptor `CacheInvalidator`), nhiều yêu cầu cùng lúc chỉ tính một lần, LRU theo dung lượng + hạn 10 phút; lưu sẵn JSON + ETag + bản nén br/gzip; `compression` cho các phản hồi khác; nới giới hạn theo IP (cả nhà thờ họ chung wifi/CGNAT); Caddy chuyển `/api/*` thẳng tới API; Postgres chỉnh cho VPS 2 GB; trang công khai **dựng sẵn** (ISR 5 phút + máy chủ web hỏi API 15 giây/lần, đổi thì dựng lại ngay) | Đo 2.000 người, 100 kết nối: phả đồ thành viên 38 → 401 lượt/giây (chờ 97,5% từ 5,6 s → 0,5 s), phả đồ công khai 84 → 2.747, trang chủ công khai 500 → 4.045, lịch giỗ 97 → 1.275; trang `/xem` 1.375 lượt/giây | Redis (thêm dịch vụ, chưa cần với một bản API); cache ở Cloudflare (dữ liệu thành viên riêng tư); SSR mỗi lần (chỉ ~240 lượt/giây) |
| ADR-019 | 2026-11-09 | Thống kê truy cập **gom trong bộ nhớ API, ghi mỗi phút** vào `analytics_daily`/`analytics_dims`; đang xem tính trong bộ nhớ; mã khách trong `localStorage` | Một bản API; không thêm Redis (tiết kiệm RAM VPS); đông người xem cũng chỉ một lần ghi/phút | Redis HyperLogLog (ADR-004/005 — giữ làm hướng mở rộng); ghi DB mỗi lượt xem |
| ADR-020 | 2026-11-09 | **Vẽ phả đồ PDF/SVG ngay trong API** bằng PDFKit + fontkit từ cùng bố cục `layoutTree` (một "cảnh" hình đơn giản, hai bộ vẽ); phông Be Vietnam Pro + Alegreya bản TTF đầy đủ trong `apps/api/assets/fonts` (Alegreya tĩnh tạo từ bản biến thiên bằng fontTools); xuất **đồng bộ** (không hàng đợi, bảng `exports` chưa dùng); nhiều trang: lặp lại lề "Đời n", nhãn hàng/cột để ghép | 2.000 người: PDF < 1 s, SVG 0,3 s; không cần Chromium trong image (~300 MB) | Playwright/Chromium in HTML (nặng, chậm); vẽ phía trình duyệt (khó in khổ lớn, phông) |
| ADR-021 | 2026-11-09 | **Nhập Excel hai bước**: kiểm tra (lưu dòng thô + lỗi vào `imports`) → xác nhận (lập lại kế hoạch với dữ liệu hiện tại rồi ghi) → hoàn tác 24 h (xoá cứng quan hệ, xoá mềm người). Nối vào phả cũ bằng Mã = id người đã có (lấy từ file xuất); dòng người đã có bị bỏ qua, không cập nhật. Thuỷ tổ = người không cha mẹ, có con, nam, dòng trên. `partner_a` = người có cha mẹ trong họ | Người lớn tuổi quen Excel; thấy lỗi theo dòng trước khi ghi; an toàn khi lỡ tay | Sửa người đã có qua Excel (dễ ghi đè nhầm); nhập ngay không xem trước |
| ADR-011 | 2026-11-01 | `CLAN_MODE=single`: chỉ tạo được dòng họ đầu tiên, `GET /instance` cho web biết dòng họ chính; vẫn giữ RLS đa dòng họ | Chủ dự án dùng riêng cho một dòng họ; giữ đường mở rộng | Bỏ hẳn `clan_id` / RLS |
| ADR-010 | 2026-11-01 | API dùng **Kysely** (query builder có kiểu) thay Prisma Client; Prisma chỉ giữ schema + migration. NestJS 12 ESM | Đặt `set_config('app.clan_id')` trong cùng transaction cho RLS rõ ràng; ltree, CTE đệ quy, `update … from (values …)` viết thẳng SQL; không cần engine nhị phân của Prisma | Prisma Client + `$extends` cho RLS, Drizzle |
| ADR-009 | 2026-11-01 | Ràng buộc phả hệ cả ở DB (trigger chặn vòng lặp, tự làm cha mẹ, nối chéo dòng họ) ngoài kiểm tra ở `genealogy-core` | Phòng thủ nhiều lớp; FK không xét RLS nên cần trigger chặn nối người khác dòng họ | Chỉ kiểm tra ở service |

---

## 17. CHANGELOG

Định dạng: `## [phiên bản] — YYYY-MM-DD` rồi các mục Thêm / Sửa / Xoá / Bảo mật.

## [0.16.0] — 2026-11-09 — Nhập phả từ Excel, in phả đồ PDF/SVG, xuất danh sách
### Thêm
- Nhập từ Excel (ADR-021): file mẫu (Danh sách / Ví dụ / Hướng dẫn), đọc ngày kiểu Việt Nam (1950, 3/1950, 12/3/1950, khoảng 1950, "ngày 5 tháng 4 năm 1941", âm lịch, nhuận), ngày giỗ không năm; kiểm tra theo dòng (thiếu/trùng mã, mã không có, cha là nữ, vòng lặp tổ tiên, cha nhiều vợ thiếu Mã mẹ, người chưa nối vào cây); file đánh dấu lỗi; xem trước số người, số đời, thuỷ tổ; xác nhận ghi theo lô (2.004 người: kiểm tra 0,4 s, ghi 3,5 s); hoàn tác 24 giờ; lịch sử nhập. Nối nhánh mới vào phả cũ bằng file xuất.
- In phả đồ (ADR-020): PDF khổ A4–A0 hoặc giấy cuộn, một trang hoặc chia trang ghép (lặp lề Đời, nhãn hàng/cột), kèm ảnh chân dung; SVG nhúng phông; báo trước số trang và cỡ chữ khi in. Xuất danh sách Excel đúng mẫu nhập.
- Web: trang **Nhập – xuất** (`/dong-ho/:id/nhap-xuat`), nút **In / Xuất** trên phả đồ (bắt đầu từ người đang chọn), liên kết trong Cài đặt và ở màn hình phả đồ trống.
- `wrapName`, `lifespan` chuyển vào `@coinguon/genealogy-core` (web và bản in dùng chung). `TreeBuilder` tách khỏi `TreeController`. `PersonsService.personValues/factRows` dùng chung cho thêm một người và nhập hàng loạt.
- Thư viện: `exceljs` 4.4 (ép `uuid` ^11.1.1 và `unzipper` ^0.12.3 qua `pnpm-workspace.yaml` — bỏ lỗ hổng mức trung bình và gói không ghi giấy phép), `pdfkit` 0.20, `fontkit` 2; ngoại lệ giấy phép có lý do: jszip (chọn MIT), pako (MIT + Zlib), chainsaw (MIT/X11).
- Test: 17 test lập kế hoạch nhập + đọc ngày, 9 test API nhập – xuất, 1 test trình duyệt (in PDF → xuất danh sách → thêm dòng → file lỗi → nhập → hoàn tác).

## [0.15.0] — 2026-11-09 — Thư viện ảnh theo album
### Thêm
- API album: danh sách (số ảnh, ảnh bìa), tạo/sửa (tên, mô tả, ai được xem, ảnh bìa), xoá (giữ hoặc xoá ảnh), chuyển nhiều ảnh, tải thẳng vào album, "Ảnh lẻ"; album công khai trên `/public/albums`. Không cần migration (bảng `albums`, cột `media.album_id` có từ 0.1).
- Web: thẻ **Ảnh** cho thành viên — lưới album, trang album (thêm nhiều ảnh một lúc, 3 ảnh song song, báo ảnh lỗi; xem lớn, tải ảnh gốc), chế độ **Chọn ảnh** (chuyển album, đặt ảnh bìa, sửa chú thích, xoá), sửa/xoá album. Trang công khai: thẻ **Ảnh** (`/xem/anh`) và mục "Thư viện ảnh" trên trang chủ công khai.
- Test: 10 test API album, 1 test trình duyệt (tạo album → tải 3 ảnh → bìa, chú thích → công khai → khách xem).

## [0.14.0] — 2026-11-09 — Đông người xem cùng lúc, thống kê truy cập, lời nhắn của khách, ảnh xem trước khi chia sẻ link
### Thêm
- Bộ nhớ đệm phả đồ / lịch giỗ / trang công khai trong API, ETag → 304, nén br/gzip (ADR-018). Biến `DB_POOL_MAX`, `CACHE_MAX_MB`, `CACHE_TTL_SEC`; Postgres chỉnh theo VPS 2 GB; Caddy chuyển `/api/*` thẳng tới API; ảnh nền hoa văn được trình duyệt giữ 1 ngày.
- Thống kê truy cập (ADR-019): `/t/pv`, `/t/hb`, `/clans/:id/stats/live`, `/clans/:id/stats/daily`, `/public/stats`; trang **Thống kê** cho quản trị; bộ đếm cuối trang công khai.
- Lời nhắn của khách: form ở trang Liên hệ công khai (ô bẫy chống máy gửi), `/public/messages`, email báo quản trị; mục "Lời nhắn của khách" trong Cài đặt (đánh dấu đã trả lời, xoá), số lời nhắn mới trên thẻ Cài đặt.
- Ảnh xem trước khi gửi link lên Zalo/Facebook (Open Graph): tên dòng họ, câu giới thiệu, ảnh banner đầu tiên; tiêu đề tab theo tên dòng họ. Trang công khai dựng sẵn (ISR) và tự làm mới khi trang chủ công khai đổi (`instrumentation.ts`).
### Sửa
- Nới giới hạn theo IP cho cả họ dùng chung một mạng: xem trang công khai 600 → 3000/5 phút, đăng nhập 30 → 120/15 phút (vẫn 15 lần cho mỗi tài khoản), đăng ký 10 → 40/giờ, xin vào họ 10 → 40/giờ, link mời 60 → 300 (xem) và 20 → 100 (nhận).
- Ảnh công khai: kiểm tra quyền bằng danh sách nhớ sẵn thay vì 2 truy vấn mỗi ảnh.
- `pnpm chay` đặt `PUBLIC_URL` theo link Cloudflare cho cả web (ảnh xem trước) chứ không chỉ API.

## [0.13.1] — 2026-11-03
### Sửa
- Đổi `pnpm server` → **`pnpm chay`** (`chay:link|nhat-ky|sao-luu|dung`): `server` trùng lệnh có sẵn của pnpm (store server) nên pnpm báo `Unknown option: 'mau'` và không chạy script (giống `setup` → `khoi-tao` trước đây).

## [0.13.0] — 2026-11-03 — Lệnh chạy server: dữ liệu mẫu / dữ liệu thật
### Thêm
- `scripts/server.mjs` (`pnpm chay --mau | --that`, `chay:link|nhat-ky|sao-luu|dung`; `pnpm demo` = `--mau`): kiểm tra Docker, sửa CRLF, gỡ server cũ theo nhãn project (cả bản `pnpm demo` cũ, không cần file env), build + chạy, tạo dữ liệu mẫu, lấy link Cloudflare, in tóm tắt; khi lỗi in trạng thái + nhật ký.
- Tách dữ liệu: `--mau` → project `coinguon-mau` + `.env.demo`, xoá sạch và seed lại mỗi lần, sao lưu `backups/du-lieu-mau/` (3 ngày); `--that` → project `coinguon` + `.env.that`, tự sao lưu trước khi dựng lại, giữ dữ liệu, sao lưu `backups/` (30 ngày). Lần đầu `--that` trên máy từng chạy `pnpm demo` cũ: dùng lại mật khẩu `.env.demo` và cảnh báo nếu CSDL chứa dữ liệu giả; `--xoa-du-lieu-cu` sao lưu rồi xoá. `--khong-link` bỏ tunnel.
- `chay-server.cmd` (Windows, bấm đúp, menu 1/2/3; `.gitattributes` giữ CRLF cho `*.cmd`), `chay-server.sh` (macOS/Linux).
### Xoá
- `scripts/demo.mjs`, `pnpm demo:xoa` (dữ liệu mẫu luôn tạo mới).

## [0.12.1] — 2026-11-03 — Nền phả đồ khít cả chiều ngang
### Sửa
- Nền phả đồ có ba bản ghép lại từ các lớp PSD theo tỉ lệ 1.41 / 1.75 / 2.1 (`scripts/ghep-nen-pha-do.py`: lớp giữ nguyên cỡ, chỉ dời ngang; hàng hoa văn trên/dưới lát nối khít; khung rất rộng thêm một cặp rồng chầu). Khung phả đồ dùng container query `aspect-ratio` chọn bản gần nhất rồi `cover` — phủ kín hai chiều, không méo, cắt tối đa ~12%.

## [0.12.0] — 2026-11-02 — Website công khai, ban liên lạc
### Thêm
- Trang công khai `/xem` (không cần đăng nhập): trang chủ (banner, câu đối, khẩu hiệu, **địa chỉ nhà thờ họ** + nút Chỉ đường Google Maps, giỗ sắp tới, ban liên lạc), phả đồ, lịch giỗ, liên hệ. Khách mở `/` được đưa thẳng vào `/xem`; trang đăng nhập có lối sang trang công khai.
- Quyết định chủ dự án (ADR-017): khách chỉ thấy người **đã mất** để chế độ "Mọi người"; không có mật khẩu xem chung; liên hệ gồm trưởng họ, trưởng các chi, quản trị (tên, số điện thoại, email).
- API `PublicController` (`/public/site|tree|persons/:id|anniversaries|media/:id/:variant`, giới hạn 600 lượt/5 phút/IP), `ContactsController` (bảng `contacts` sẵn có: `public_fields` + `consent_at`), `GraphService.load(…, only)` lọc người, `loadAnniversarySources(…, "public")`, `homeSettings.templeAddress`.
- Cài đặt → **Ban liên lạc** (thêm/sửa/xoá/sắp thứ tự, bắt xác nhận đồng ý trước khi công khai). Liên hệ có nút Gọi, Zalo (`zalo.me/0…`), email.
### Sửa
- `Field` dùng `useId` làm mã ô: trước đây hai form cùng tên trường trên một trang (vd. "name") làm nhãn gắn nhầm ô.
- API nhận `null` như ô trống ở các trường không bắt buộc (form gửi email trống dạng null bị 422).
- `RateLimitGuard` đọc cấu hình ở cả controller lẫn hàm.

## [0.11.0] — 2026-11-02 — Hoàn thiện nhập phả
### Thêm
- Hồ sơ: tên thường gọi, tên huý/tự/hiệu/thuỵ; quê quán, nghề nghiệp/chức tước, nơi an táng (bảng `person_facts` sẵn có, không cần migration); tiểu sử văn bản `{text}` (`biographySchema`). Bảng thông tin hiện **thứ bậc** ("Trưởng nam, trong 3 người con", "Con một", kèm "con nuôi").
- Quan hệ: thêm con chọn ruột/nuôi/riêng; xếp thứ tự con bằng nút ↑↓; vợ cả/vợ hai… và đổi thứ tự; "Đổi cha mẹ, con ruột/nuôi" (gắn người nhập rời, sửa nhầm cha mẹ, đổi loại con); gỡ quan hệ vợ chồng nhập nhầm khi chưa có con chung. API mới: `PUT …/persons/:id/parent-link`, `PUT …/persons/:id/unions/order`, `DELETE …/unions/:id`.
- Hướng dẫn sử dụng v1.7 (mục 11–13).
### Sửa
- `biography` trước là `unknown` (rich text dự kiến) → nay `{text}`; dữ liệu cũ đều null nên không cần chuyển đổi.

## [0.10.1] — 2026-11-02 — Nền phả đồ vàng hoàng theo file thiết kế
### Sửa
- Nền phả đồ dùng ảnh từ file thiết kế của chủ dự án `giaphatrangdengoc.psd` (rồng, mây, tròn lót): ẩn lớp trắng "Layer 3" để lộ nền vàng #f4e79c, giảm độ mờ các lớp hoạ tiết 20% → 10% cho tông-trên-tông, bỏ dải viền của ảnh (viền vẽ bằng CSS, màu son thẫm #670513 lấy từ lớp KHUNG). Ảnh web: `public/hoa-van/nen-rong-vang.webp` (2400px, 120 KB, `background-size: cover`). Token `--color-hoang`, `--color-khung`.
- Bỏ hoạ tiết tự vẽ `luong-long.svg` và `scripts/ve-hoa-van.mjs`, bỏ tiện ích `nen-giay-do`.
### Ghi chú
- File PSD gốc và bản đã chỉnh màu không đưa vào repo (28 MB); giữ ở máy chủ dự án. Repo đang công khai: ảnh nền nằm trong `public/`.

## [0.10.0] — 2026-11-02 — Lịch giỗ
### Thêm
- API `GET /clans/:id/anniversaries` và `…/anniversaries.ics` (`apps/api/src/anniversaries/`): tính giỗ trên đường đi từ `persons.death_anniv_lunar` (không lưu bảng riêng) bằng `anniversariesBetween` của `@coinguon/lunar-vn`; theo `clans.day30_rule`; tháng nhuận → tháng thường; "giỗ lần thứ" = năm âm của lần giỗ − năm âm lúc mất (1 = giỗ đầu, 2 = giỗ hết); "hôm nay" theo giờ Việt Nam.
- Web: thẻ **Lịch giỗ** (12 tháng tới, chia theo tháng, ô ngày kiểu tờ lịch bloc có ngày âm), nút **Thêm vào lịch điện thoại** (.ics hai năm, nhắc trước 3 ngày), khung **Giỗ sắp tới** (60 ngày) ở trang chủ, nhắc số người chưa đủ ngày/tháng mất.
- Hướng dẫn sử dụng v1.6: lịch giỗ, đăng nhập bằng số điện thoại, duyệt thành viên, tạo tài khoản giúp, câu hỏi về link mời.
### Ghi chú
- Tên file .ics chỉ dùng slug không dấu: Chrome bỏ cả tên file khi `filename*` có dấu.

## [0.9.0] — 2026-11-02 — Đăng nhập bằng số điện thoại, duyệt thành viên, nền phả đồ mới
### Thêm
- Đăng nhập/đăng ký bằng **số điện thoại hoặc email** (ít nhất một). Migration `20261103000000_phone_login_join_requests`: `users.email` thành tuỳ chọn, `users.phone` unique (dạng +84…), CHECK có ít nhất một. `parseLoginId`/`loginIdSchema`/`phoneSchema` ở `@coinguon/schemas`; API `POST /auth/login` nhận `identifier` (vẫn nhận `email` cũ). Giới hạn tần suất theo tài khoản dùng khoá đã chuẩn hoá.
- **Tự đăng ký → chờ duyệt** (chế độ một dòng họ): bảng `join_requests` (RLS theo dòng họ); `GET/POST /instance/join-request`; quản trị `GET /clans/:id/join-requests`, `POST …/:id/approve {role, personId?}`, `POST …/:id/reject`. Web: trang chờ duyệt tự vào khi được duyệt; mục "Yêu cầu tham gia" trong Cài đặt; số yêu cầu hiện trên thẻ Cài đặt.
- **Quản trị tạo tài khoản** cho người mới theo vai trò: `POST /clans/:id/members {name, phone?, email?, role, personId?}` → tài khoản chưa có mật khẩu + link đặt mật khẩu 7 ngày; giao diện soạn sẵn tin nhắn Zalo. Không gắn tài khoản đã có sẵn (tránh quản trị chiếm tài khoản người khác qua link đặt lại mật khẩu).
- Nút **Hiện/Ẩn mật khẩu** ở mọi ô mật khẩu (`components/field.tsx`).
- Nền phả đồ: giấy dó + hoạ tiết chìm "lưỡng long chầu nguyệt" tự vẽ (`scripts/ve-hoa-van.mjs` → `public/hoa-van/luong-long.svg`), lề "Đời" sơn then chữ thếp, khung viền thếp đôi, vạch ngăn đời thay cho dải màu.
### Sửa
- Mở link mời khi đang đăng nhập tài khoản đã là thành viên (thường là quản trị tự thử link): trước đây bấm "Tham gia" là vào luôn bằng tài khoản quản trị nên tưởng link cấp sai vai trò. Nay trang mời nói rõ đang dùng tài khoản nào, vai trò gì, có nút "Đăng xuất để dùng tài khoản khác"; API trả thêm `role`. Thanh trên cùng luôn hiện "Tên · Vai trò".

## [0.8.1] — 2026-11-02 — Demo chạy ổn trên Windows
### Sửa
- `pnpm demo` kiểm tra Docker Desktop đã chạy chưa, tự đổi CRLF → LF cho file trong `infra/docker/` (Git trên Windows đổi kiểu xuống dòng làm hỏng script khởi tạo CSDL), và khi lỗi tự in `compose ps -a` + nhật ký 40 dòng của db/migrate/media-init/api/web kèm gợi ý.
- Thêm `.gitattributes` (`* text=auto eol=lf`, ảnh/font là binary).
### Thêm
- `pnpm demo:xoa` (`compose down -v`): xoá dữ liệu demo hỏng để làm lại. Mục "Khi `pnpm demo` báo lỗi" trong `docs/TRIEN-KHAI.md`.

## [0.8.0] — 2026-11-02 — Sẵn sàng demo: quên mật khẩu, chặn dò mật khẩu, Docker, sao lưu
### Thêm
- Quên mật khẩu: bảng `password_resets` (migration `20261102000200_password_resets`, sha256, dùng một lần, link mới huỷ link cũ); email qua SMTP (nodemailer, `MailService`) hoặc ghi log khi chưa cấu hình; quản trị tạo link 24 giờ cho thành viên. Trang `/quen-mat-khau`, `/dat-lai-mat-khau`, link trên trang đăng nhập.
- Giới hạn tần suất theo IP (+ theo email) cho đăng nhập, đăng ký, quên/đặt lại mật khẩu, lời mời, tải ảnh (`common/rate-limit.ts`, bộ đếm trong bộ nhớ, 429 kèm `Retry-After`); IP thật qua `TRUST_PROXY`/`CLIENT_IP_HEADER`.
- Docker: `infra/docker/Dockerfile` (target api/web, chạy được x86 + ARM), `compose.prod.yml`, `postgres/init-roles.sh` (mật khẩu từ env), `backup/backup.sh`, `caddy/Caddyfile`, `.dockerignore`.
- `packages/db/scripts/migrate.mjs` + `pnpm --filter @coinguon/db migrate`; `pnpm khoi-tao` dùng nó (máy cá nhân không cần tải engine Prisma).
- `pnpm demo` (+ `demo:link`, `demo:dung`, `demo:sao-luu`, `demo:nhat-ky`): sinh `.env.demo` với mật khẩu ngẫu nhiên, build, chạy, lấy link trycloudflare, tự đặt `PUBLIC_URL`, tuỳ chọn `--du-lieu-mau`.
- `docs/TRIEN-KHAI.md`: hướng dẫn 3 cách (máy cá nhân 0 đ, Oracle Free 0 đ, Bizfly), email Gmail, sao lưu/khôi phục, kiểm tra an toàn.
- CI: job `docker` build image + chạy cả hệ thống + seed + đăng nhập qua web + sao lưu; DB e2e chạy bằng `migrate.mjs` rồi `prisma migrate status`.
- Test: API 68 (thêm 8: quên/đặt lại mật khẩu, link quản trị, giới hạn tần suất), 18 Playwright.
### Sửa
- Biến môi trường để trống (`PUBLIC_URL=`) coi như không đặt.
- Nút gửi của các form mở trực tiếp bằng link (đăng nhập, đăng ký, quên/đặt lại mật khẩu, tạo dòng họ) bị khoá tới khi trang sẵn sàng (`lib/use-hydrated.ts`): bấm quá sớm trên máy chậm làm trình duyệt gửi form kiểu cũ và mất thao tác (phát hiện qua CI).
- Docker: service `media-init` chỉnh quyền volume ảnh (volume do service backup tạo trước thì thuộc root).
- Playwright không chạy lại test (`retries: 0`) vì luồng chính chạy nối tiếp trên cùng dữ liệu.
- Giấy phép: cho phép MIT-0 (nodemailer).

## [0.7.1] — 2026-11-02 — Xem ảnh lớn
### Thêm
- `components/lightbox.tsx`: bấm ảnh chân dung hoặc ảnh banner → khung xem ảnh lớn (thẻ `<dialog>` gốc: giữ focus, Esc đóng, trả focus về nút đã mở). Phóng to xem bản gốc (bấm đúp/nút), chuyển ảnh bằng ‹ ›/phím mũi tên/vuốt, quay vòng, tải ảnh gốc, chú thích dưới ảnh. Banner dừng tự trượt khi đang xem.
### Sửa
- Ảnh đã có trong cache trình duyệt không bắn sự kiện `load` kịp → khung xem kẹt "Đang tải ảnh…"; nay ghi nhớ theo đường dẫn ảnh và kiểm tra `img.complete` (có test Playwright).

## [0.7.0] — 2026-11-02 — Ảnh chân dung, trang chủ có banner tự trượt
### Thêm
- API ảnh (ADR-015): tải lên, xử lý, lưu ổ đĩa, phục vụ có kiểm quyền, chú thích, xoá; ảnh chân dung cho người (`PUT …/avatar`); trang chủ `site/home` (banner nhiều ảnh, câu đối, khẩu hiệu, thống kê).
- Web: **Trang chủ** dòng họ (`/dong-ho/:id`) — banner tự trượt quay vòng (dừng khi rê chuột/đang dùng bàn phím/tab ẩn, vuốt trên điện thoại, không tự trượt khi "giảm chuyển động"), câu đối dựng đứng hai bên (điện thoại: dưới ảnh). **Phả đồ chuyển sang `/dong-ho/:id/pha-do`.**
- Ảnh chân dung trong bảng thông tin (thêm/đổi/gỡ/tải gốc) và thu nhỏ trên ô phả đồ (ô rộng 172×76).
- Cài đặt → **Trang chủ**: tải nhiều ảnh banner, chú thích, đổi thứ tự, câu đối, khẩu hiệu.
- Seed: 3 ảnh banner minh hoạ **tự vẽ bằng SVG** (`src/seed-art.ts`, không dùng ảnh có bản quyền) + câu đối dân gian "Cây có cội… / Nước có nguồn…".
- Test: API 60 (thêm 11 cho ảnh: EXIF/GPS bị xoá, xoay đúng, quyền xem, quá dung lượng, ảnh dòng họ khác…), web 25 + 17 Playwright.
### Ghi chú
- HEIC (iPhone) chưa đọc được: `sharp` dựng sẵn không kèm bộ giải mã HEVC; giao diện báo cách xử lý (KI-019).

## [0.6.0] — 2026-11-02 — Mời thành viên, vai trò, cài đặt dòng họ
### Thêm
- Bảng `invitations` (migration `20261102000000_invitations`, có RLS, CHECK không cấp `owner`).
- API: thành viên (xem, đổi vai trò, xoá), "Đây là tôi", lời mời (tạo, liệt kê, huỷ, xem trước công khai, nhận). Quy tắc: chỉ cấp/quản lý vai trò thấp hơn mình.
- Web: thẻ **Cài đặt** (chỉ quản trị): tạo link mời + sao chép/chia sẻ, link còn hiệu lực, thành viên & vai trò, thông tin dòng họ (đổi thuỷ tổ, cách xưng hô). Trang `/moi/[token]` cho người nhận (chưa có tài khoản → đăng ký rồi quay lại). Nút "Đây là tôi" trong bảng thông tin.
- Đăng nhập/đăng ký nhận `?tiep=` an toàn (`lib/redirect.ts`, chặn chuyển hướng ra ngoài).
- Test: API 49 (thêm 13 cho thành viên/lời mời/phân quyền), web 24 đơn vị + 15 Playwright.
### Bảo mật
- Bảng `domains` bị sót Row-Level Security từ migration đầu → migration `20261102000100_domains_rls`: đọc công khai (tra website theo tên miền), ghi chỉ trong dòng họ hiện tại.
- Test mới trong `packages/db`: **mọi bảng có cột `clan_id` phải bật + ép RLS và có policy** — thêm bảng mới mà quên RLS thì CI đỏ.
### Sửa
- Hướng dẫn sử dụng v1.2: mục 9, 11–13, 21 viết lại theo giao diện thật; vai trò "Biên tập viên" đổi tên thành **Người nhập liệu** cho khớp giao diện.

## [0.5.1] — 2026-11-01
### Thêm
- `pnpm khoi-tao` (scripts/setup-local.mjs): tạo `.env`, chờ PostgreSQL, migration, build, dữ liệu mẫu — chạy được trên Windows/macOS/Linux.
- `pnpm dev` chạy API + web cùng lúc qua turbo; API `dev`/`start` tự đọc `.env` ở thư mục gốc.
### Sửa
- Lệnh `migrate:deploy` khi chạy từ `pnpm khoi-tao` nhận `DATABASE_URL` từ `.env` gốc (Prisma chỉ tự đọc `.env` trong packages/db).
- Script `dev` của API trước đây dùng `&` — không chạy đúng trên Windows.

## [0.5.0] — 2026-11-01 — Áp dụng quyết định của chủ dự án
### Thêm
- `CLAN_MODE` (mặc định `single`) và `GET /instance`; tách `ClansService`.
- Dữ liệu mẫu giả: `pnpm --filter @coinguon/api seed` → 1 tài khoản, "Họ Phan Văn – làng Mẫu (dữ liệu giả)", ~60 người, 6 đời, ngày mất âm/dương lịch.
- `apps/web` (Next.js 16, Tailwind 4, TanStack Query; font Alegreya + Be Vietnam Pro; màu sơn then – son – vàng thếp – men ngọc):
  đăng nhập/đăng ký, tạo dòng họ lần đầu (`/bat-dau`), phả đồ (`/dong-ho/:id`, người chọn nằm trên URL `?nguoi=`), danh sách tìm không dấu,
  tra xưng hô, trợ giúp, PWA (manifest, service worker, trang offline). Next chuyển tiếp `/api/v1` sang API → cookie cùng origin.
- API: danh sách người trả thêm `deathYear`.
- Test: 23 test đơn vị web, 11 test Playwright (desktop + điện thoại) chạy trong CI.
- `scripts/check-licenses.mjs` thay `license-checker` (công cụ cũ không đọc được node_modules của pnpm nên thực tế chỉ kiểm tra rất ít gói).
### Sửa
- Xưng hô mặc định chuyển sang miền Trung (migration `20261101000200_default_kinship_trung`); bảng miền Trung thêm "o", "dượng".
### Ghi chú
- Hosting: Bizfly Cloud 4 GB thay cho kế hoạch 30–40 USD/tháng; bỏ R2 ở giai đoạn đầu.

## [0.4.0] — 2026-11-01 — MVP phần 1: API phả đồ
### Thêm
- `apps/api` (NestJS 12 + Kysely): đăng ký/đăng nhập bằng cookie phiên HttpOnly + CSRF double-submit, Argon2id, khoá tài khoản 15 phút sau 5 lần sai.
- Dòng họ: tạo (người tạo là owner, tạo sẵn `site_settings`), xem, sửa cài đặt (thuỷ tổ, phụ hệ/mẫu hệ, biến thể xưng hô, quy tắc giỗ ngày 30).
- Người & quan hệ: thêm/sửa/xoá mềm, thêm con (tự gắn hôn phối), vợ/chồng (người mới hoặc có sẵn), cha mẹ (thuỷ tổ tự dời lên), sắp thứ tự con, tìm kiếm không dấu. Mọi thay đổi ghi `audit_logs` và tính lại đời/thuộc họ/`lineage_path`.
- Tự tính ngày giỗ âm lịch (`death_anniv_lunar`) từ ngày mất.
- `GET /tree` trả bố cục đã tính sẵn (giao diện chỉ việc vẽ); `GET /kinship` xưng hô hai chiều.
- 33 test e2e (Supertest trên PostgreSQL thật, DB riêng `coinguon_test_api`); CI tạo DB này trước khi test. Tổng 159 test.
### Ghi chú cho người bảo trì
- Truy vấn theo dòng họ **luôn** đi qua `Database.withClan()`; không dùng `db.app` trực tiếp cho bảng có RLS (sẽ trả rỗng).
- Bảng `clans`, `users`, `sessions` không có RLS — truy cập qua `db.app` được, nhưng luôn lọc theo id.

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
| KI-009 | Quên mật khẩu **đã có** (0.8.0); còn thiếu xác minh email khi đăng ký (người dùng gõ sai email thì không nhận được link) | Thấp | Khi bật SMTP cho bản chạy thật |
| KI-010 | ~~Chưa có rate limit theo IP~~ — **đã có** (0.8.0), bộ đếm trong bộ nhớ: chạy nhiều bản API thì chuyển sang Redis | Thấp | Khi mở rộng nhiều máy |
| KI-011 | Phân quyền theo chi (editor chỉ sửa chi được giao) chưa làm — editor sửa được cả cây | Thấp | Phase 2 theo kế hoạch |
| KI-012 | `GET /tree` tính bố cục mỗi lần gọi (chưa cache); ổn với vài nghìn người | Thấp | Cache theo `clan.tree_version` khi cây > 5.000 người |
| KI-013 | Xưng hô khác nhau theo vùng/gia đình: cần màn hình cho ban quản lý sửa bảng xưng hô riêng của dòng họ (lưu JSON trong cài đặt) | Trung bình | MVP phần 2 |
| KI-014 | ~~Người đăng ký mới chưa vào được dòng họ~~ — **đã xử lý** bằng link mời (0.6.0) | Đã xử lý | — |
| KI-017 | ~~Chưa có giao diện thứ tự con, con nuôi/riêng, thứ tự vợ/chồng~~ — **đã có** (0.11.0) | Đã xử lý | — |
| KI-018 | ~~Xem trước lời mời chưa giới hạn tần suất~~ — **đã có** (0.8.0) | Đã xử lý | — |
| KI-015 | `API_ORIGIN` của web được "đóng" vào lúc build (rewrites của Next) — đổi địa chỉ API phải build lại | Thấp | Docker build truyền `API_ORIGIN`; hoặc Caddy chuyển thẳng `/api` sang API |
| KI-016 | Danh sách người hiện tối đa 50 người đầu, chưa có phân trang trên giao diện | Thấp | Thêm "Xem thêm" khi dòng họ > 50 người |
| KI-019 | Ảnh HEIC chưa đọc được (sharp dựng sẵn không có HEVC). iPhone qua trình duyệt thường tự đổi sang JPG | Thấp | Nếu người dùng gặp nhiều: chuyển đổi trên trình duyệt (thư viện WASM) trước khi tải |
| KI-020 | Chưa giới hạn tổng dung lượng ảnh mỗi dòng họ; VPS 40 GB | Trung bình | Thêm hạn mức + cảnh báo khi > 70% ổ đĩa, trước khi mở cho nhiều người tải |
| KI-021 | Ảnh chỉ xem được khi đã đăng nhập (route dưới `/clans/:clanId`). Website công khai sẽ cần route ảnh công khai cho banner/ảnh người đã mất có `privacy=public` | Trung bình | Khi làm website công khai (MVP phần 2) |
| KI-022 | ~~Chưa có thư viện ảnh~~ — xong 0.15.0. Còn: video, tài liệu PDF; chỉ biên tập viên trở lên tải ảnh (thành viên thường chưa đóng góp được) | Thấp | Thêm vai trò/duyệt ảnh đóng góp khi chủ dự án cần |
| KI-023 | Quick Tunnel: link đổi mỗi lần khởi động lại, không cam kết hoạt động — chỉ để demo | Thấp | Chạy thật: Oracle Free/Bizfly + Caddy, hoặc Cloudflare Tunnel có tên (cần tài khoản + tên miền) |
| KI-024 | Image `cloudflare/cloudflared:latest` chưa ghim phiên bản | Thấp | Ghim tag cụ thể khi chạy lâu dài |
| KI-025 | Sao lưu nằm trên cùng máy; chưa tự đẩy sang Google Drive | Trung bình | Thêm rclone vào service backup khi chạy thật |
| KI-026 | Chế độ nhiều dòng họ: quản trị dòng họ B tạo được link đặt lại mật khẩu cho thành viên của B, kể cả khi người đó là quản trị dòng họ A → chiếm được quyền ở A. Chế độ một dòng họ (đang dùng) không bị | Cao khi bật `CLAN_MODE=multi` | Trước khi bật multi: chỉ cho tạo link với tài khoản chỉ thuộc dòng họ này, hoặc tài khoản do chính dòng họ tạo |
| KI-028 | Bộ nhớ đệm, số đếm thống kê, giới hạn tần suất nằm trong bộ nhớ **một** tiến trình API. Chạy nhiều bản API (cân bằng tải) thì mỗi bản giữ cache riêng (dữ liệu cũ tới 10 phút ở bản khác) và đếm sai | Trung bình khi mở rộng | Một bản API đủ cho một dòng họ. Khi cần: Redis pub/sub báo xoá cache + Redis cho thống kê, giới hạn tần suất |
| KI-029 | Khởi động lại API giữa ngày: khách quay lại trong ngày bị đếm thêm một "người xem"; số chưa ghi (≤ 1 phút) mất nếu API bị tắt đột ngột (tắt bình thường vẫn ghi) | Thấp | Chấp nhận; chuyển Redis nếu cần chính xác |
| KI-030 | Form lời nhắn chỉ chống spam bằng giới hạn 10 lần/giờ/IP + ô bẫy; chưa bật Cloudflare Turnstile | Thấp | Bật Turnstile (schema đã có `turnstileToken`) khi bị spam |
| KI-032 | Nhập Excel chỉ **thêm người mới**; dòng người đã có bị bỏ qua (không sửa được hàng loạt qua Excel). Không nhập được tổ tiên phía trên thuỷ tổ hiện có (dùng "Thêm cha/mẹ" trên phả đồ) | Thấp | Thêm chế độ cập nhật có xem trước thay đổi khi cần |
| KI-033 | Ngày giỗ ghi riêng (không rõ năm mất) chỉ nhập được qua Excel; form sửa người chưa có ô này, và sửa ngày mất trên form sẽ tính lại (ghi đè) ngày giỗ | Trung bình | Thêm ô "Ngày giỗ (âm lịch)" vào form người |
| KI-034 | Cây rất rộng (cả nghìn người cùng đời) in một trang thì chữ li ti, chia trang thì hàng trăm trang — trang Nhập – xuất báo trước và khuyên in từng nhánh. Chưa có xuất ảnh PNG | Thấp | In từng chi; thêm PNG khi cần |
| KI-035 | Kiểm thử trình duyệt: Playwright không đưa được file từ đường dẫn có dấu tiếng Việt vào ô chọn file — file thử ghi vào thư mục tạm không dấu | Thấp | — |
| KI-031 | Đổi ảnh banner / tên dòng họ: ảnh xem trước khi chia sẻ link cập nhật sau ~15 giây; Zalo/Facebook còn nhớ ảnh cũ của link đã chia sẻ (dùng công cụ "Sharing Debugger" của Facebook để làm mới) | Thấp | — |
| KI-027 | Số điện thoại chưa được xác minh (OTP SMS): ai cũng đăng ký được bằng số của người khác (vẫn phải chờ quản trị duyệt) | Trung bình | Quản trị kiểm tra trước khi duyệt; thêm OTP SMS/Zalo khi có ngân sách |
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
