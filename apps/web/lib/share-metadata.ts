import type { Metadata } from "next";
import type { PublicSite } from "./types";

/**
 * Thẻ xem trước khi gửi link lên Zalo / Facebook / Messenger (Open Graph): tên dòng họ, câu giới thiệu, ảnh nhà thờ họ.
 *
 * Chạy trên máy chủ Next, đọc trang công khai từ API. Trang dựng sẵn và làm mới 5 phút/lần (`revalidate` ở trang dùng
 * hàm này) — đông người mở cùng lúc vẫn chỉ phát trang tĩnh, không gọi API mỗi lần.
 * Ảnh xem trước cần địa chỉ đầy đủ: lấy từ PUBLIC_URL (pnpm chay tự đặt theo link Cloudflare; máy chủ có tên miền thì
 * ghi vào file env). Chưa có PUBLIC_URL thì vẫn có tên và mô tả, chỉ thiếu ảnh.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

/** Số giây trang công khai được giữ trước khi dựng lại */
export const SHARE_REVALIDATE_SEC = 300;

async function loadSite(): Promise<PublicSite | null> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/v1/public/site`, { next: { revalidate: SHARE_REVALIDATE_SEC }, signal: AbortSignal.timeout(3000) });
    return res.ok ? ((await res.json()) as PublicSite) : null;
  } catch {
    // lúc build (chưa có API) hoặc API đang khởi động: dùng thẻ mặc định, lần làm mới sau sẽ có
    return null;
  }
}

function siteBase(): URL | undefined {
  try {
    return process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL) : undefined;
  } catch {
    return undefined;
  }
}

export async function shareMetadata(path: string): Promise<Metadata> {
  const site = await loadSite();
  const base = siteBase();
  if (!site) return base ? { metadataBase: base } : {};
  const { clan, home, stats } = site;
  const description =
    home.motto ??
    (stats.people > 0
      ? `Gia phả ${clan.name}: phả đồ ${stats.generations} đời, lịch giỗ và ban liên lạc của dòng họ.`
      : `Gia phả ${clan.name}: phả đồ, lịch giỗ và ban liên lạc của dòng họ.`);
  const banner = home.banners[0];
  return {
    ...(base && { metadataBase: base }),
    // absolute: tên dòng họ đứng một mình, không nối thêm "· Gia Phả Cội Nguồn"
    title: { absolute: clan.name, template: `%s · ${clan.name}` },
    description,
    openGraph: {
      type: "website",
      locale: "vi_VN",
      siteName: clan.name,
      title: clan.name,
      description,
      ...(base && { url: path }),
      ...(base &&
        banner && {
          images: [
            {
              url: banner.urls.lg,
              ...(banner.width && banner.height && { width: banner.width, height: banner.height }),
              alt: banner.caption ?? `Ảnh ${clan.name}`,
            },
          ],
        }),
    },
    twitter: { card: base && banner ? "summary_large_image" : "summary", title: clan.name, description },
  };
}
