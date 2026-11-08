import type { Metadata, Viewport } from "next";
import { type ReactNode, Suspense } from "react";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { VisitTracker } from "@/components/visit-tracker";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Gia Phả Cội Nguồn", template: "%s · Gia Phả Cội Nguồn" },
  description: "Ghi chép phả hệ dòng họ: phả đồ, các đời, ngày giỗ và cách xưng hô.",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Gia Phả", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#241a17",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
        {/* useSearchParams cần Suspense để các trang còn lại vẫn dựng sẵn được */}
        <Suspense fallback={null}>
          <VisitTracker />
        </Suspense>
      </body>
    </html>
  );
}
