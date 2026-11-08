"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthShell } from "@/components/auth-shell";
import { FormError } from "@/components/field";
import { FullPageMessage, RequireAuth } from "@/components/require-auth";
import { api, ApiError } from "@/lib/api";
import { loginLabel } from "@/lib/format";
import { keys, useInstance, useMe, useMyClans } from "@/lib/queries";
import type { MyJoinRequest } from "@/lib/types";

/** Điều hướng ban đầu: chưa có dòng họ → tạo; đã là thành viên → vào dòng họ; chưa là thành viên → xin vào, chờ duyệt. */
function Router() {
  const router = useRouter();
  const instance = useInstance();
  const clans = useMyClans();
  const first = clans.data?.[0];

  useEffect(() => {
    if (!instance.data || !clans.data) return;
    if (first) router.replace(`/dong-ho/${first.id}`);
    else if (!instance.data.clan) router.replace("/bat-dau");
  }, [instance.data, clans.data, first, router]);

  if (instance.data?.clan && clans.data && !first) return <WaitingRoom clanName={instance.data.clan.name} />;
  if (instance.error || clans.error) return <FullPageMessage>{(instance.error ?? clans.error)!.message}</FullPageMessage>;
  return <FullPageMessage>Đang mở gia phả…</FullPageMessage>;
}

const JOIN_KEY = ["instance", "join-request"] as const;

/** Người đã có tài khoản nhưng chưa là thành viên: gửi yêu cầu tham gia và chờ ban quản lý duyệt. */
function WaitingRoom({ clanName }: { clanName: string }) {
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: JOIN_KEY,
    queryFn: () => api<{ request: MyJoinRequest | null }>("GET", "/instance/join-request"),
    refetchInterval: 30_000, // được duyệt thì tự vào, không cần tải lại trang
  });
  const send = useMutation({
    mutationFn: (message: string) => api<MyJoinRequest>("POST", "/instance/join-request", { message: message || undefined }),
    onSuccess: (request) => qc.setQueryData(JOIN_KEY, { request }),
  });
  const [message, setMessage] = useState("");
  const req = status.data?.request ?? null;

  useEffect(() => {
    if (req?.status === "approved") void qc.invalidateQueries({ queryKey: keys.clans });
  }, [req?.status, qc]);

  async function logout() {
    await api("POST", "/auth/logout").catch(() => undefined);
    qc.clear();
    router.replace("/dang-nhap");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    send.mutate(message.trim());
  }

  const account = me.data ? `${me.data.name} (${loginLabel(me.data)})` : "";
  const footer = (
    <p className="mt-8 border-t border-ngoc-200 pt-4 text-sm text-reu">
      Đang đăng nhập: {account}.{" "}
      <button type="button" onClick={logout} className="font-medium text-son underline-offset-4 hover:underline">
        Đăng xuất
      </button>
    </p>
  );

  if (status.isPending) return <FullPageMessage>Đang tải…</FullPageMessage>;

  if (req?.status === "pending") {
    return (
      <AuthShell title="Đang chờ duyệt">
        <div role="status" className="space-y-4">
          <p>
            Đã gửi yêu cầu tham gia <strong className="font-serif text-lg font-normal text-son">{clanName}</strong> lúc{" "}
            {new Date(req.createdAt).toLocaleString("vi-VN")}.
          </p>
          <p className="text-reu">Ban quản lý duyệt xong, trang này tự mở gia phả. Muốn nhanh hơn, hãy báo trưởng họ hoặc người quản lý.</p>
          {req.message && <p className="border-l-2 border-thep pl-3 text-sm">Lời nhắn của bạn: {req.message}</p>}
          <p className="text-sm text-reu">Nếu ban quản lý đã gửi bạn link mời, mở link đó để vào ngay.</p>
        </div>
        {footer}
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Xin vào dòng họ">
      <form onSubmit={submit} className="space-y-5" noValidate>
        {req?.status === "rejected" ? (
          <p role="status" className="rounded-md border border-loi/30 bg-son-nhat px-3 py-2 text-sm">
            Ban quản lý chưa duyệt yêu cầu trước của bạn. Bạn có thể gửi lại kèm lời nhắn rõ hơn, hoặc liên hệ trưởng họ.
          </p>
        ) : (
          <p>
            Tài khoản của bạn chưa là thành viên <strong className="font-serif text-lg font-normal text-son">{clanName}</strong>. Gửi yêu cầu để ban quản lý duyệt.
          </p>
        )}
        <FormError message={send.error?.message} />
        <label className="block">
          <span className="nhan">Bạn là ai trong họ? (không bắt buộc)</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={500}
            className="o-nhap"
            placeholder="Ví dụ: con ông Lê Văn Tư, chi hai"
          />
        </label>
        <button type="submit" className="btn-chinh w-full" disabled={send.isPending}>
          {send.isPending ? "Đang gửi…" : "Gửi yêu cầu tham gia"}
        </button>
      </form>
      {footer}
    </AuthShell>
  );
}

/** Khách (chưa đăng nhập) vào trang công khai của dòng họ; chưa có dòng họ thì đăng nhập/tạo mới */
export function HomeClient() {
  const me = useMe();
  const instance = useInstance();
  const router = useRouter();
  const guest = me.error instanceof ApiError && me.error.status === 401;
  useEffect(() => {
    if (!guest) return;
    if (instance.data) router.replace(instance.data.clan ? "/xem" : "/dang-nhap");
    else if (instance.error) router.replace("/dang-nhap");
  }, [guest, instance.data, instance.error, router]);
  if (guest) return <FullPageMessage>Đang mở gia phả…</FullPageMessage>;
  return (
    <RequireAuth>
      <Router />
    </RequireAuth>
  );
}
