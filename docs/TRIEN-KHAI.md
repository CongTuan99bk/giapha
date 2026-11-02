# Hướng dẫn đưa Gia Phả Cội Nguồn lên mạng

Có ba cách, từ dễ đến chắc chắn:

| Cách | Chi phí | Chạy 24/7? | Link | Hợp cho |
| --- | --- | --- | --- | --- |
| **A. Máy cá nhân + Cloudflare Quick Tunnel** | 0 đ | Chỉ khi máy bật | `https://<ngẫu-nhiên>.trycloudflare.com`, **đổi mỗi lần khởi động lại** | Demo nhanh hôm nay |
| **B. Oracle Cloud Always Free** | 0 đ (cần thẻ để xác minh) | Có | `https://<IP>.sslip.io` hoặc tên miền riêng | Dùng thử lâu dài, miễn phí |
| **C. VPS Bizfly 4 GB** | ~240.000 đ/tháng (chưa VAT) | Có, máy chủ ở Việt Nam | Tên miền riêng | Chạy thật cho cả họ |

Cả ba dùng chung một bộ cấu hình Docker (`infra/docker/compose.prod.yml`): PostgreSQL, API, web, **sao lưu tự động lúc 2 giờ sáng** (CSDL + ảnh, giữ 14 ngày, nằm trong thư mục `backups/`).

---

## A. Demo trên máy cá nhân (0 đồng)

### Cài một lần

1. **Docker Desktop** — https://www.docker.com/products/docker-desktop/ → cài, mở lên, đợi biểu tượng cá voi báo *running*.
   Windows: nếu được hỏi, bật **WSL 2** theo hướng dẫn của trình cài.
2. **Git** — https://git-scm.com/downloads
3. **Node.js** bản **LTS** (22 trở lên) — https://nodejs.org → tải bản LTS, cài với các lựa chọn mặc định.
   - Trình cài trên Windows có ô **"Automatically install the necessary tools"** (cài thêm Python, Visual Studio Build Tools, Chocolatey): **không cần tích**.
   - Cài xong, **mở PowerShell mới** (Windows) hoặc Terminal (macOS) gõ lệnh cài **pnpm**:
     ```bash
     npm install -g pnpm@10
     ```
   - Kiểm tra: `node -v` ra `v22…` trở lên, `pnpm -v` ra `10…`.
   (Node.js từ bản 25 không còn kèm `corepack`, nên dùng lệnh `npm install -g pnpm@10` ở trên thay cho `corepack enable`.)

### Chạy demo

```bash
git clone https://github.com/CongTuan99bk/giapha.git
cd giapha
pnpm demo --du-lieu-mau
```

- Lần đầu mất khoảng 5–10 phút (tải và build). Các lần sau nhanh hơn.
- Xong, màn hình in ra:
  - **Link gửi cho người khác**: `https://….trycloudflare.com` — gửi qua Zalo là mở được trên điện thoại.
  - **Tài khoản dữ liệu mẫu** (email + mật khẩu) để đăng nhập xem thử.
- Không muốn dữ liệu giả: chạy `pnpm demo` (không có `--du-lieu-mau`), mở link → **Tạo tài khoản** → bạn là người tạo dòng họ.

### Các lệnh thường dùng

| Lệnh | Làm gì |
| --- | --- |
| `pnpm demo` | Bật lại (giữ dữ liệu). **Link mới sẽ khác** — gửi lại link cho mọi người |
| `pnpm demo:link` | In lại link hiện tại |
| `pnpm demo:dung` | Dừng (giữ dữ liệu) |
| `pnpm demo:sao-luu` | Sao lưu ngay vào thư mục `backups/` |
| `pnpm demo:nhat-ky` | Xem nhật ký máy chủ (Ctrl+C để thoát) |

### Lưu ý

- Máy tính **ngủ hoặc tắt thì link không vào được**. Windows: *Settings → System → Power* → để *Sleep: Never* khi đang demo.
- Quick Tunnel là dịch vụ thử nghiệm của Cloudflare: không cam kết luôn chạy, tối đa 200 người truy cập cùng lúc — thừa cho một dòng họ.
- Mật khẩu CSDL được sinh ngẫu nhiên trong file `.env.demo`. **Không gửi file này cho ai, không đưa lên GitHub** (đã được bỏ qua sẵn).
- Cập nhật bản mới: `git pull` rồi `pnpm demo` (tự build lại và nâng cấp CSDL, dữ liệu giữ nguyên).

---

## B. Oracle Cloud Always Free (0 đồng, chạy 24/7)

Gói miễn phí hiện cho máy ảo ARM khoảng **2 nhân, 12 GB RAM** chạy liên tục — dư cho hệ thống này.
Đăng ký cần thẻ ngân hàng để xác minh (không trừ tiền nếu chỉ dùng phần miễn phí).
Oracle có thể **thu hồi máy để không** (dùng CPU rất thấp trong nhiều ngày) — xem điều khoản *Always Free* của Oracle; nên vào trang ít nhất vài lần mỗi tuần và luôn giữ bản sao lưu.

1. Tạo tài khoản tại https://www.oracle.com/cloud/free/ — chọn vùng gần Việt Nam (ví dụ Singapore). Vùng không đổi được sau này.
2. Tạo máy ảo (Compute → Instance): ảnh **Ubuntu 24.04**, kiểu **Ampere (VM.Standard.A1.Flex)**, 2 OCPU, 12 GB RAM. Tải về khoá SSH khi được hỏi.
3. Mở cổng **80** và **443** cho máy ảo: trong *Virtual Cloud Network → Security List* thêm *Ingress rule* TCP 80 và 443 từ `0.0.0.0/0`.
4. SSH vào máy (`ssh -i <khoá> ubuntu@<IP>`), rồi:
   ```bash
   # Ảnh Ubuntu của Oracle chặn sẵn cổng bằng iptables — mở 80/443
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save

   # Docker
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER && newgrp docker

   git clone https://github.com/CongTuan99bk/giapha.git && cd giapha
   ```
5. Tạo file `.env.prod` (thay `<IP>` bằng IP công khai, dấu chấm đổi thành gạch nối, ví dụ `140-238-1-2.sslip.io`):
   ```bash
   cat > .env.prod <<EOF
   DB_PASSWORD=$(openssl rand -hex 24)
   APP_DB_PASSWORD=$(openssl rand -hex 24)
   PLATFORM_DB_PASSWORD=$(openssl rand -hex 24)
   DOMAIN=<IP-gạch-nối>.sslip.io
   PUBLIC_URL=https://<IP-gạch-nối>.sslip.io
   COOKIE_SECURE=true
   EOF
   chmod 600 .env.prod
   ```
   `sslip.io` là dịch vụ tên miền miễn phí tự trỏ về IP trong tên — có ngay HTTPS mà không cần mua tên miền. Có tên miền riêng thì điền vào `DOMAIN` và `PUBLIC_URL`, và trỏ bản ghi **A** của tên miền về IP máy chủ.
6. Chạy:
   ```bash
   docker compose -f infra/docker/compose.prod.yml --env-file .env.prod --profile caddy up -d --build
   ```
   Mở `https://<IP-gạch-nối>.sslip.io` → **Tạo tài khoản** → tạo dòng họ.
7. Cập nhật bản mới: `git pull && docker compose -f infra/docker/compose.prod.yml --env-file .env.prod --profile caddy up -d --build`.

---

## C. VPS Bizfly (chạy thật)

Giống cách B từ bước 4 (không cần bước iptables nếu VPS không chặn). Gói đề xuất: 4 GB RAM / 40 GB SSD.
Nên mua tên miền riêng (`.vn` hoặc `.com`) và dùng `DOMAIN=giapha.tenmien.vn`.

---

## Gửi email (quên mật khẩu)

Chưa cấu hình thì hệ thống **không gửi email**; quản trị dùng **Cài đặt → Thành viên → Tạo link đặt lại mật khẩu** rồi gửi qua Zalo.
Muốn gửi email bằng Gmail:

1. Bật xác minh 2 bước cho tài khoản Gmail, tạo **Mật khẩu ứng dụng** (App password) — 16 ký tự.
2. Thêm vào file env (`.env.demo` hoặc `.env.prod`), đổi `@` trong email thành `%40`:
   ```
   SMTP_URL=smtps://tenban%40gmail.com:matkhauungdung16kytu@smtp.gmail.com:465
   SMTP_FROM=Gia phả họ Nguyễn <tenban@gmail.com>
   ```
3. Chạy lại `pnpm demo` (hoặc lệnh `docker compose … up -d`).

Với cách A, `PUBLIC_URL` (địa chỉ trong link email) được `pnpm demo` tự cập nhật theo link Quick Tunnel mới.

---

## Sao lưu và khôi phục

- Tự động mỗi ngày lúc `BACKUP_HOUR` giờ (mặc định 2 giờ sáng), giữ `BACKUP_KEEP_DAYS` ngày (mặc định 14), vào thư mục `backups/`:
  `db_<ngày>.dump` (cơ sở dữ liệu) và `media_<ngày>.tar.gz` (ảnh).
- **Nên chép thư mục `backups/` sang nơi khác** (Google Drive, ổ cứng ngoài) định kỳ — máy hỏng thì bản sao lưu trên chính máy đó cũng mất.
- Khôi phục (ví dụ với cách A; cách B/C đổi `.env.demo` thành `.env.prod`):
  ```bash
  F="docker compose -f infra/docker/compose.prod.yml --env-file .env.demo"
  $F stop api web
  # CSDL
  $F exec -T db pg_restore -U coinguon -d coinguon --clean --if-exists < backups/db_2026-11-02_0200.dump
  # Ảnh (volume "coinguon_media"; 1000 là mã người dùng "node" trong container API)
  docker run --rm -v coinguon_media:/media -v "$PWD/backups:/backups" postgres:16-alpine \
    sh -c "rm -rf /media/* && tar -xzf /backups/media_2026-11-02_0200.tar.gz -C /media && chown -R 1000:1000 /media"
  $F up -d
  ```

---

## Kiểm tra an toàn trước khi mời cả họ

- [ ] File `.env.demo` / `.env.prod` không nằm trên GitHub (`git status` không thấy nó).
- [ ] Đăng nhập bằng HTTPS (link `https://…`).
- [ ] Đã thử **Tạo link đặt lại mật khẩu** cho một thành viên.
- [ ] Đã chạy `pnpm demo:sao-luu` (hoặc lệnh sao lưu) và thấy file trong `backups/`.
- [ ] Đổi mật khẩu tài khoản dữ liệu mẫu, hoặc xoá dữ liệu mẫu trước khi nhập dữ liệu thật:
      `docker compose -f infra/docker/compose.prod.yml --env-file .env.demo --profile tunnel down -v` (**xoá hết dữ liệu**) rồi `pnpm demo`.
