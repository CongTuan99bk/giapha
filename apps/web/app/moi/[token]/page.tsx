"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthShell } from "@/components/auth-shell";
import { FormError } from "@/components/field";
import { api, ApiError } from "@/lib/api";
import { keys, useMe } from "@/lib/queries";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/roles";
import type { InvitationPreview } from "@/lib/types";

const STATUS_TEXT = {
  expired: "Lời mời này đã hết hạn.",
  revoked: "Lời mời này đã bị huỷ.",
  used: "Lời mời này đã được dùng hết lượt.",
} as const;

/** Trang mở từ link mời: xem mình được mời vào đâu, đăng nhập/đăng ký rồi tham gia. */
export default function InvitationPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const invite = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => api<InvitationPreview>("GET", `/invitations/${encodeURIComponent(token)}`),
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const here = `/moi/${token}`;
  const loggedIn = Boolean(me.data);

  async function accept() {
    setPending(true);
    setError(null);
    try {
      const res = await api<{ clanId: string }>("POST", `/invitations/${encodeURIComponent(token)}/accept`);
      await qc.invalidateQueries({ queryKey: keys.clans });
      router.replace(`/dong-ho/${res.clanId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tham gia được.");
      setPending(false);
    }
  }

  if (invite.isPending) return <AuthShell title="Lời mời">Đang mở lời mời…</AuthShell>;
  if (invite.error) {
    const notFound = invite.error instanceof ApiError && invite.error.status === 404;
    return (
      <AuthShell title="Không mở được lời mời">
        <p className="text-reu">{notFound ? "Đường link không đúng hoặc đã bị cắt mất một phần. Hãy mở lại link gốc ban quản lý gửi." : invite.error.message}</p>
      </AuthShell>
    );
  }

  const inv = invite.data;
  const usable = inv.status === "active";
  return (
    <AuthShell title="Bạn được mời tham gia">
      <div className="-mt-2">
        <p className="font-serif text-[1.75rem] leading-tight text-son">{inv.clanName}</p>
        <dl className="mt-5 grid grid-cols-[7rem_1fr] gap-y-2 text-[0.95rem]">
          <dt className="text-reu">Người mời</dt>
          <dd>{inv.invitedBy ?? "Ban quản lý"}</dd>
          <dt className="text-reu">Vai trò</dt>
          <dd>
            {ROLE_LABEL[inv.role]}
            <span className="block text-sm text-reu">{ROLE_HINT[inv.role]}</span>
          </dd>
          {usable && (
            <>
              <dt className="text-reu">Hết hạn</dt>
              <dd>{new Date(inv.expiresAt).toLocaleDateString("vi-VN")}</dd>
            </>
          )}
        </dl>
        {inv.forSpecificEmail && usable && (
          <p className="mt-4 text-sm text-reu">Lời mời này chỉ dành cho một địa chỉ email cụ thể — hãy dùng đúng email đã được mời.</p>
        )}
      </div>

      <div className="mt-8 space-y-4">
        {!usable ? (
          <FormError message={`${STATUS_TEXT[inv.status as keyof typeof STATUS_TEXT]} Hãy nhờ ban quản lý gửi lời mời mới.`} />
        ) : me.isPending ? null : loggedIn ? (
          <>
            <FormError message={error} />
            <p className="text-sm text-reu">Bạn đang đăng nhập là {me.data!.email}.</p>
            <button type="button" className="btn-chinh w-full" onClick={accept} disabled={pending}>
              {pending ? "Đang tham gia…" : "Tham gia dòng họ"}
            </button>
          </>
        ) : (
          <>
            <Link href={`/dang-ky?tiep=${encodeURIComponent(here)}`} className="btn-chinh w-full">
              Tạo tài khoản để tham gia
            </Link>
            <Link href={`/dang-nhap?tiep=${encodeURIComponent(here)}`} className="btn-phu w-full">
              Tôi đã có tài khoản
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}
