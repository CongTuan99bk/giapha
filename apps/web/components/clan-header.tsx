"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useClan, useMe } from "@/lib/queries";
import { ROLE_RANK } from "@/lib/roles";

const TABS = [
  { href: "", label: "Phả đồ" },
  { href: "/danh-sach", label: "Danh sách" },
  { href: "/xung-ho", label: "Xưng hô" },
] as const;

/** Thanh trên cùng: tên dòng họ (chữ có chân), các mục chính, người dùng. */
export function ClanHeader({ clanId }: { clanId: string }) {
  const clan = useClan(clanId);
  const me = useMe();
  const path = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const base = `/dong-ho/${clanId}`;

  async function logout() {
    await api("POST", "/auth/logout").catch(() => undefined);
    qc.clear();
    router.replace("/dang-nhap");
  }

  return (
    <header className="bg-then text-ngoc-50">
      <div className="flex items-center gap-4 px-4 pt-3 md:px-6">
        <Link href={base} className="min-w-0 flex-1 truncate font-serif text-xl text-thep-nhat md:text-2xl">
          {clan.data?.name ?? "Gia Phả Cội Nguồn"}
        </Link>
        <span className="hidden text-sm text-ngoc-300 sm:inline">{me.data?.name}</span>
        <button type="button" onClick={logout} className="rounded px-2 py-1 text-sm text-ngoc-200 hover:text-white">
          Đăng xuất
        </button>
      </div>
      <nav aria-label="Mục chính" className="mt-2 flex gap-1 overflow-x-auto px-2 md:px-4">
        {[...TABS, ...(clan.data && ROLE_RANK[clan.data.role] >= ROLE_RANK.admin ? [{ href: "/cai-dat", label: "Cài đặt" } as const] : [])].map((t) => {
          const href = base + t.href;
          const active = t.href === "" ? path === base : path.startsWith(href);
          return (
            <Link
              key={t.href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-t-md px-4 py-2 text-[0.95rem] ${
                active ? "bg-ngoc-50 font-medium text-then" : "text-ngoc-200 hover:text-white"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
        <Link href="/tro-giup" className="whitespace-nowrap rounded-t-md px-4 py-2 text-[0.95rem] text-ngoc-200 hover:text-white">
          Trợ giúp
        </Link>
      </nav>
    </header>
  );
}
