import type { MetadataRoute } from "next";

/** PWA: cài lên màn hình điện thoại từ trình duyệt (ADR-012). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gia Phả Cội Nguồn",
    short_name: "Gia Phả",
    description: "Phả đồ dòng họ, ngày giỗ và cách xưng hô.",
    lang: "vi",
    start_url: "/",
    display: "standalone",
    background_color: "#f1f4ef",
    theme_color: "#241a17",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
