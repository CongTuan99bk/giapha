/**
 * Chạy một lần khi máy chủ Next khởi động.
 *
 * Trang công khai được dựng sẵn (phát trang tĩnh — chịu được rất đông người xem). Phần dựng sẵn gồm tên dòng họ và
 * ảnh xem trước khi gửi link lên Zalo/Facebook, nên cần làm mới khi các thông tin đó đổi:
 * cứ 15 giây hỏi API một lần (trả 304 "không đổi" rất nhẹ), thấy trang chủ công khai đổi thì dựng lại ngay.
 * Lần đầu (vừa khởi động, lúc build chưa có API) cũng được tính là "đổi".
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const token = crypto.randomUUID();
  (globalThis as { __coinguonRefreshToken?: string }).__coinguonRefreshToken = token;
  const self = `http://localhost:${process.env.PORT ?? "3000"}`;
  const api = process.env.API_ORIGIN ?? "http://localhost:4000";
  let lastEtag: string | null = null;
  let running = false;

  async function check() {
    if (running) return;
    running = true;
    try {
      const res = await fetch(`${api}/api/v1/public/site`, {
        headers: lastEtag ? { "If-None-Match": lastEtag } : {},
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      // 304: không đổi; 404: chưa có dòng họ / chạy nhiều dòng họ
      if (res.status !== 200) return;
      const etag = res.headers.get("etag");
      await res.arrayBuffer();
      const r = await fetch(`${self}/noi-bo/lam-moi`, { method: "POST", headers: { "x-lam-moi": token }, cache: "no-store" });
      if (!r.ok) return;
      lastEtag = etag;
      // mở thử để dựng lại ngay, khách tiếp theo nhận trang mới
      for (const path of ["/xem", "/", "/xem/pha-do", "/xem/lich-gio", "/xem/anh", "/xem/lien-he"]) {
        await fetch(self + path, { cache: "no-store" })
          .then((x) => x.arrayBuffer())
          .catch(() => undefined);
      }
    } catch {
      // API chưa chạy hoặc đang khởi động lại: lần sau thử tiếp
    } finally {
      running = false;
    }
  }

  setTimeout(() => void check(), 2000).unref();
  setInterval(() => void check(), 15_000).unref();
}
