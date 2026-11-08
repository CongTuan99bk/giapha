import type { NextConfig } from "next";

/**
 * Trình duyệt chỉ gọi cùng origin `/api/v1/*`; Next chuyển tiếp sang API (NestJS).
 * Nhờ vậy cookie phiên `sid` là cookie first-party, không cần CORS.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` }];
  },
  async headers() {
    return [
      // Ảnh nền hoa văn: ít khi đổi → trình duyệt giữ 1 ngày, sau đó vẫn dùng bản cũ trong lúc tải bản mới
      { source: "/hoa-van/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      // service worker luôn lấy bản mới để cập nhật kịp
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
