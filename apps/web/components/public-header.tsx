"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePublicMusic } from "@/lib/public";
import { useMe } from "@/lib/queries";
import { MusicButton } from "./music-button";

const TABS = [
  { href: "/xem", label: "Trang chủ" },
  { href: "/xem/pha-do", label: "Phả đồ" },
  { href: "/xem/lich-gio", label: "Lịch giỗ" },
  { href: "/xem/anh", label: "Ảnh" },
  { href: "/xem/lien-he", label: "Liên hệ" },
] as const;

/** Thanh trên trang công khai: cùng dáng thanh của thành viên, thêm nút Đăng nhập cho con cháu */
export function PublicHeader({ name }: { name: string }) {
  const path = usePathname();
  const me = useMe();
  const music = usePublicMusic().data?.music;
  return (
    <header className="bg-then text-ngoc-50">
      <div className="flex items-center gap-4 px-4 pt-3 md:px-6">
        <Link href="/xem" className="min-w-0 flex-1 truncate font-serif text-xl text-thep-nhat md:text-2xl">
          {name}
        </Link>
        <MusicButton music={music} />
        {me.data ? (
          <Link href="/" className="rounded px-2 py-1 text-sm text-ngoc-200 hover:text-white">
            Trang thành viên
          </Link>
        ) : (
          <Link href="/dang-nhap" className="rounded border border-thep/60 px-3 py-1 text-sm text-thep-nhat hover:bg-thep/20">
            Đăng nhập
          </Link>
        )}
      </div>
      <nav aria-label="Mục chính" className="mt-2 flex gap-1 overflow-x-auto px-2 md:px-4">
        {TABS.map((t) => {
          const active = t.href === "/xem" ? path === "/xem" : path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-t-md px-4 py-2 text-[0.95rem] ${
                active ? `${t.href === "/xem/pha-do" ? "bg-hoang" : "bg-ngoc-50"} font-medium text-then` : "text-ngoc-200 hover:text-white"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
