# Hướng dẫn đưa Gia Phả Cội Nguồn lên mạng

Có ba cách, từ dễ đến chắc chắn (cách A có hai kiểu link):

| Cách | Chi phí | Chạy 24/7? | Link | Hợp cho |
| --- | --- | --- | --- | --- |
| **A. Máy cá nhân + Cloudflare Quick Tunnel** | 0 đ | Chỉ khi máy bật | `https://<ngẫu-nhiên>.trycloudflare.com`, **đổi mỗi lần khởi động lại** | Demo nhanh hôm nay |
| **A. Máy cá nhân + Tailscale Funnel** | 0 đ (tài khoản Tailscale miễn phí) | Chỉ khi máy bật | `https://<tên-máy>.<tên-mạng>.ts.net`, **cố định** | Gửi link cho cả họ khi chưa có tên miền |
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
   - Windows báo lỗi **"pnpm.ps1 cannot be loaded because running scripts is disabled on this system"**: PowerShell đang chặn chạy script. Gõ một lần
     `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` → `Y` → Enter, rồi chạy lại. (Hoặc gõ `pnpm.cmd` thay cho `pnpm`, hoặc dùng Command Prompt.)
   (Node.js từ bản 25 không còn kèm `corepack`, nên dùng lệnh `npm install -g pnpm@10` ở trên thay cho `corepack enable`.)

### Chạy server — một lệnh

```bash
git clone https://github.com/CongTuan99bk/giapha.git
cd giapha
pnpm chay --mau      # dữ liệu MẪU (giả) để thử, để demo
pnpm chay --that     # dữ liệu THẬT của dòng họ
```

**Windows:** bấm đúp file **`chay-server.cmd`** ở thư mục repo → chọn **1** (dữ liệu mẫu), **2** (dữ liệu thật), **3** (dữ liệu thật, chỉ xem trên máy này), **4** (dữ liệu thật, link cố định qua Tailscale — xem mục *Link cố định* bên dưới) hoặc **5** (quay lại link tạm Cloudflare). macOS/Linux: `./chay-server.sh mau`, `./chay-server.sh that`, `./chay-server.sh that-tailscale`.

Mỗi lần chạy, lệnh tự làm hết: kiểm tra Docker → **dọn server cũ** (cả bản `pnpm demo` cũ) → build bản mới nhất → chạy → in **link chia sẻ** `https://….trycloudflare.com` (gửi qua Zalo là mở được trên điện thoại).

| | `--mau` (dữ liệu mẫu) | `--that` (dữ liệu thật) |
| --- | --- | --- |
| Dữ liệu cũ | **Xoá sạch, tạo lại** 60 người giả mỗi lần | **Giữ nguyên**; tự **sao lưu trước** khi dựng lại server |
| Tài khoản | In ra tài khoản quản lý mẫu | CSDL trống: mở link → **Tạo tài khoản** → người đầu tiên là quản lý chính |
| File cấu hình (mật khẩu CSDL) | `.env.demo` | `.env.that` |
| Thư mục sao lưu | `backups/du-lieu-mau/` (giữ 3 ngày) | `backups/` (giữ 30 ngày) |

Hai loại dữ liệu nằm ở **hai bộ dữ liệu Docker riêng** (`coinguon-mau` và `coinguon`): chạy dữ liệu mẫu không bao giờ đụng tới dữ liệu thật. Mỗi lúc chỉ chạy một server (cùng cổng 3000) — chạy loại này sẽ tắt loại kia.

- Lần đầu mất khoảng 5–10 phút (tải và build). Các lần sau nhanh hơn.
- Cập nhật bản mới: `git pull` rồi chạy lại đúng lệnh (dữ liệu thật giữ nguyên, CSDL tự nâng cấp).
- **Từng chạy `pnpm demo` bản cũ?** Dữ liệu của bản cũ được coi là "dữ liệu thật" (vì cùng chỗ lưu). Lần đầu chạy `pnpm chay --that`, lệnh dùng lại mật khẩu cũ để vẫn mở được, và **cảnh báo nếu trong đó là dữ liệu giả**. Muốn bắt đầu dữ liệu thật sạch sẽ:
  ```bash
  pnpm chay --that --xoa-du-lieu-cu    # sao lưu trước, rồi xoá, rồi chạy CSDL trống
  ```

### Các lệnh thường dùng

| Lệnh | Làm gì |
| --- | --- |
| `pnpm chay --mau` / `pnpm demo` | Chạy lại với dữ liệu mẫu mới tinh |
| `pnpm chay --that` | Chạy (hoặc cập nhật) server dữ liệu thật |
| thêm `--tailscale` | Link **cố định** qua Tailscale; nhớ lựa chọn — các lần `pnpm chay --that` sau dùng luôn |
| thêm `--cloudflare` | Quay lại link tạm Cloudflare (mặc định) |
| thêm `--khong-link` | Lần này không mở link chia sẻ, chỉ xem trên máy này (http://localhost:3000) |
| `pnpm chay:link` | In lại link chia sẻ của server đang chạy |
| `pnpm chay:sao-luu` | Sao lưu ngay (CSDL + ảnh) |
| `pnpm chay:nhat-ky` | Xem nhật ký máy chủ (Ctrl+C để thoát) |
| `pnpm chay:dung` | Dừng server (giữ dữ liệu) |

### Lưu ý

- Máy tính **ngủ hoặc tắt thì link không vào được**. Windows: *Settings → System → Power* → để *Sleep: Never* khi đang chạy.
- Link Cloudflare **đổi mỗi lần chạy lại** — gửi lại link mới cho mọi người. Muốn link cố định: dùng Tailscale (mục ngay dưới), hoặc cách B/C.
- Quick Tunnel là dịch vụ thử nghiệm của Cloudflare: không cam kết luôn chạy, tối đa 200 người truy cập cùng lúc — thừa cho một dòng họ.
- Mật khẩu CSDL sinh ngẫu nhiên trong `.env.demo` / `.env.that`. **Không gửi cho ai, không đưa lên GitHub** (đã được bỏ qua sẵn). **Giữ kỹ `.env.that`** — mất file này thì không mở được CSDL thật (vẫn khôi phục được từ bản sao lưu).

### Link cố định qua Tailscale (không cần mua tên miền)

Tailscale Funnel cho một link `https://<tên-máy>.<tên-mạng>.ts.net` **không đổi khi chạy lại**. Như Cloudflare, không phải mở cổng trên modem; khác ở chỗ dữ liệu được mã hoá **tới tận máy bạn** (máy chủ trung gian của Tailscale không đọc được).

**Cài một lần:**

1. Tải **Tailscale** — https://tailscale.com/download → Windows → cài → **Log in** (dùng tài khoản Google hoặc Microsoft). macOS: dùng bản tải từ trang Tailscale.
2. **Đặt tên máy ngắn gọn trước khi gửi link** (link chứa tên máy): vào https://login.tailscale.com/admin/machines → máy của bạn → **⋯ → Edit machine name** → bỏ chọn *Auto-generate from OS hostname* → gõ ví dụ `giapha` → **Update name**.
3. *(Tuỳ chọn)* đổi phần tên mạng (`tailxxxx`) thành tên dễ đọc: https://login.tailscale.com/admin/dns → mục **Tailnet DNS name** → chọn một tên Tailscale gợi ý.

**Chạy:** bấm đúp `chay-server.cmd` → **4**, hoặc `pnpm chay --that --tailscale`.

- Lần đầu Tailscale in một link `https://login.tailscale.com/f/funnel?...` → mở link, bấm **Enable** (bật HTTPS và Funnel cho mạng của bạn). Lệnh tự chạy tiếp; nếu lệnh đã thoát thì chạy lại.
- Xong, lệnh in **Link cố định (Tailscale)**. Lần đầu mở link có thể mất khoảng 1 phút (Tailscale cấp chứng chỉ https).
- Các lần sau chọn **2** (hoặc `pnpm chay --that`) vẫn dùng đúng link đó. Quay lại Cloudflare: chọn **5** (`--cloudflare`).

**Cần biết:**

- Tailscale chỉ cho Internet vào **trang web gia phả** trên máy (cổng 3000) — không lộ thư mục hay máy khác trong nhà. `pnpm chay:dung` hoặc chuyển sang Cloudflare thì link Tailscale tự đóng.
- Đổi tên máy / tên mạng trên Tailscale thì link đổi theo — đặt tên xong rồi mới gửi link cho cả họ.
- Băng thông Funnel có giới hạn (Tailscale không công bố con số) — xem nhiều ảnh cùng lúc có thể chậm hơn Cloudflare. Máy vẫn phải bật.
- Hệ thống tự đặt `CLIENT_IP_HEADER=x-forwarded-for` (Tailscale ghi IP thật của khách vào header này) để chặn dò mật khẩu theo IP; dùng Cloudflare thì đặt lại `cf-connecting-ip`.

| Thấy gì | Làm gì |
| --- | --- |
| `Chưa cài Tailscale` | Cài theo bước 1, mở Tailscale, đăng nhập, chạy lại |
| `Tailscale chưa đăng nhập` / `đang tắt` | Bấm biểu tượng Tailscale ở khay đồng hồ → **Log in** / **Connect** |
| `Mạng Tailscale chưa cho phép Funnel` | Mở link Tailscale vừa in (hoặc https://login.tailscale.com/admin/acls) để bật Funnel, chạy lại |
| `Tailscale từ chối quyền mở Funnel` | Windows: mở PowerShell bằng **Run as administrator** rồi chạy lại. Linux: `sudo tailscale set --operator=$USER` một lần |
| `chưa bật MagicDNS` | https://login.tailscale.com/admin/dns → **Enable MagicDNS**, chạy lại |

Server vẫn chạy trên máy (http://localhost:3000) khi chưa mở được link Tailscale; sửa xong chạy lại lệnh là được.

### Khi `pnpm chay` báo lỗi

Khi lỗi, lệnh tự in **trạng thái các dịch vụ** và **nhật ký gần nhất** — nguyên nhân nằm trong phần đó, không phải ở dòng cuối.
Dòng `WARN Local package.json exists, but node_modules missing` là cảnh báo vô hại, bỏ qua được (server chạy trong Docker, không cần `pnpm install`).

| Thấy gì | Làm gì |
| --- | --- |
| `Docker chưa chạy` | Mở Docker Desktop, đợi *Engine running*, chạy lại |
| Nhật ký `db` có `password authentication failed` / `role … does not exist` | Dữ liệu mẫu: chạy lại `pnpm chay --mau` (luôn tạo mới). Dữ liệu thật: mật khẩu trong `.env.that` không khớp — khôi phục đúng file `.env.that` cũ |
| `Sao lưu không được — dừng lại` | Lệnh dừng để không mất dữ liệu; xem lỗi in ra, thường do CSDL chưa chạy |
| Lỗi tải gói khi build (`ETIMEDOUT`, `ECONNRESET`, `registry`) | Mạng chập chờn hoặc proxy công ty — chạy lại; vẫn lỗi thì đổi mạng |
| `port is already allocated` / cổng 3000 bận | Thêm dòng `WEB_PORT=3001` vào `.env.that` (hoặc `.env.demo`) rồi chạy lại |
| Windows: `WSL 2 installation is incomplete` | Mở PowerShell **Run as administrator** → `wsl --update` → khởi động lại máy |

Trên Windows, Git có thể đổi kiểu xuống dòng của các script chạy trong máy chủ Linux (CRLF); `pnpm chay` tự sửa lại trước khi chạy, và repo có `.gitattributes` để bản clone mới không bị đổi.

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
2. Thêm vào file env (`.env.that` hoặc `.env.prod`), đổi `@` trong email thành `%40`:
   ```
   SMTP_URL=smtps://tenban%40gmail.com:matkhauungdung16kytu@smtp.gmail.com:465
   SMTP_FROM=Gia phả họ Nguyễn <tenban@gmail.com>
   ```
3. Chạy lại `pnpm chay --that` (hoặc lệnh `docker compose … up -d`).

Với cách A, `PUBLIC_URL` (địa chỉ trong link email và ảnh xem trước khi gửi link lên Zalo/Facebook) được `pnpm chay` tự cập nhật theo link Quick Tunnel mới hoặc link Tailscale.
Cách B/C: ghi `PUBLIC_URL=https://giapha.tenmien.vn` vào file env.

---

## Khi đông người xem cùng lúc (ngày giỗ Tổ, họp họ)

Hệ thống đã sẵn sàng cho đông người, không cần làm gì thêm:

- API nhớ sẵn phả đồ, lịch giỗ và trang công khai; chỉ tính lại khi ban quản lý sửa dữ liệu. Phản hồi được nén (phả đồ 2.000 người: 1 MB → khoảng 110 KB) và trình duyệt đã có bản mới nhất thì máy chủ chỉ trả lời "không đổi".
- Trang công khai được dựng sẵn, tự làm mới khi trang chủ công khai thay đổi.
- Cả nhà thờ họ dùng chung một wifi (cùng địa chỉ IP) vẫn xem thoải mái: giới hạn chống dò mật khẩu tính riêng cho từng tài khoản.
- Với cách B/C (Caddy), đường `/api/` đi thẳng tới API.

Số đo trên máy thử (dòng họ 2.000 người, 9 đời, 100 kết nối cùng lúc, một bản API):

| Trang | Trước | Sau |
| --- | --- | --- |
| Phả đồ (thành viên) | 38 lượt/giây, chậm nhất 5,6 giây | 401 lượt/giây, chậm nhất 0,5 giây |
| Phả đồ công khai | 84 lượt/giây | 2.747 lượt/giây |
| Trang chủ công khai (dữ liệu) | 500 lượt/giây | 4.045 lượt/giây |
| Lịch giỗ công khai | 97 lượt/giây | 1.275 lượt/giây |

Máy chủ lớn hơn (từ 4 GB RAM) có thể chỉnh trong file env (mặc định hợp với VPS 2 GB):

| Biến | Mặc định | Gợi ý cho 4 GB |
| --- | --- | --- |
| `PG_SHARED_BUFFERS` | `256MB` | `1GB` |
| `PG_EFFECTIVE_CACHE_SIZE` | `768MB` | `3GB` |
| `DB_POOL_MAX` | `20` | `30` |
| `CACHE_MAX_MB` | `64` | `256` |

Chỉ chạy **một** bản API (không nhân bản API sau bộ cân bằng tải): bộ nhớ đệm và số đếm thống kê nằm trong bộ nhớ của bản đó (KI-028).

---

## Sao lưu và khôi phục

- Tự động mỗi ngày lúc `BACKUP_HOUR` giờ (mặc định 2 giờ sáng), giữ `BACKUP_KEEP_DAYS` ngày (mặc định 14), vào thư mục `backups/`:
  `db_<ngày>.dump` (cơ sở dữ liệu) và `media_<ngày>.tar.gz` (ảnh).
- **Nên chép thư mục `backups/` sang nơi khác** (Google Drive, ổ cứng ngoài) định kỳ — máy hỏng thì bản sao lưu trên chính máy đó cũng mất.
- Khôi phục (ví dụ với cách A; cách B/C đổi `.env.that` thành `.env.prod`):
  ```bash
  F="docker compose -p coinguon -f infra/docker/compose.prod.yml --env-file .env.that"
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

- [ ] File `.env.that` / `.env.demo` / `.env.prod` không nằm trên GitHub (`git status` không thấy nó).
- [ ] Đăng nhập bằng HTTPS (link `https://…`).
- [ ] Đã thử **Tạo link đặt lại mật khẩu** cho một thành viên.
- [ ] Đã chạy `pnpm chay:sao-luu` (hoặc lệnh sao lưu) và thấy file trong `backups/`.
- [ ] Nhập dữ liệu thật bằng `pnpm chay --that` (không dùng `--mau` — dữ liệu mẫu bị xoá mỗi lần chạy).
