"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { ClanHeader } from "@/components/clan-header";
import { FullPageMessage, RequireAuth } from "@/components/require-auth";
import { ApiError } from "@/lib/api";
import { useClan } from "@/lib/queries";

function ClanGate({ clanId, children }: { clanId: string; children: ReactNode }) {
  const clan = useClan(clanId);
  if (clan.error instanceof ApiError && clan.error.status === 404) {
    return (
      <FullPageMessage action={<Link href="/" className="btn-phu">Về trang đầu</Link>}>
        Không tìm thấy dòng họ này, hoặc bạn chưa được mời làm thành viên.
      </FullPageMessage>
    );
  }
  return (
    <div className="flex h-dvh flex-col">
      <ClanHeader clanId={clanId} />
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}

export default function ClanLayout({ children }: { children: ReactNode }) {
  const { clanId } = useParams<{ clanId: string }>();
  return (
    <RequireAuth>
      <ClanGate clanId={clanId}>{children}</ClanGate>
    </RequireAuth>
  );
}
