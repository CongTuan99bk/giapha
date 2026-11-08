"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PublicHeader } from "@/components/public-header";
import { FullPageMessage } from "@/components/require-auth";
import { ApiError } from "@/lib/api";
import { usePublicSite } from "@/lib/public";

/** Trang công khai của dòng họ: ai cũng xem được, chỉ người đã khuất */
export function PublicShell({ children }: { children: ReactNode }) {
  const site = usePublicSite();
  if (site.error) {
    const none = site.error instanceof ApiError && site.error.status === 404;
    return (
      <FullPageMessage action={<Link href="/dang-nhap" className="btn-phu">Đăng nhập</Link>}>
        {none ? "Dòng họ chưa mở trang công khai." : site.error.message}
      </FullPageMessage>
    );
  }
  if (!site.data) return <FullPageMessage>Đang mở gia phả…</FullPageMessage>;
  return (
    <div className="flex h-dvh flex-col">
      <PublicHeader name={site.data.clan.name} />
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}
