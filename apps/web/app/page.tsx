"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { FullPageMessage, RequireAuth } from "@/components/require-auth";
import { api } from "@/lib/api";
import { useMyClans } from "@/lib/queries";

interface Instance {
  clanMode: "single" | "multi";
  clan: { id: string; name: string } | null;
}

/** Điều hướng ban đầu: chưa có dòng họ → tạo; đã là thành viên → vào phả đồ; chưa được mời → hướng dẫn. */
function Router() {
  const router = useRouter();
  const instance = useQuery({ queryKey: ["instance"], queryFn: () => api<Instance>("GET", "/instance") });
  const clans = useMyClans();
  const first = clans.data?.[0];

  useEffect(() => {
    if (!instance.data || !clans.data) return;
    if (first) router.replace(`/dong-ho/${first.id}`);
    else if (!instance.data.clan) router.replace("/bat-dau");
  }, [instance.data, clans.data, first, router]);

  if (instance.data?.clan && clans.data && !first) {
    return (
      <FullPageMessage action={<Link href="/tro-giup" className="btn-phu">Xem hướng dẫn</Link>}>
        Bạn chưa là thành viên của {instance.data.clan.name}. Hãy nhờ ban quản lý dòng họ gửi lời mời cho email của bạn.
      </FullPageMessage>
    );
  }
  if (instance.error || clans.error) return <FullPageMessage>{(instance.error ?? clans.error)!.message}</FullPageMessage>;
  return <FullPageMessage>Đang mở gia phả…</FullPageMessage>;
}

export default function Home() {
  return (
    <RequireAuth>
      <Router />
    </RequireAuth>
  );
}
