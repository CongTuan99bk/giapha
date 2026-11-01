"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/queries";

/** Chưa đăng nhập → chuyển sang trang đăng nhập, quay lại đúng trang sau khi đăng nhập. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const path = usePathname();
  const unauthenticated = me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    if (unauthenticated) router.replace(`/dang-nhap?tiep=${encodeURIComponent(path)}`);
  }, [unauthenticated, path, router]);

  if (me.isPending || unauthenticated) return <FullPageMessage>Đang tải…</FullPageMessage>;
  if (me.error) return <FullPageMessage>{me.error.message}</FullPageMessage>;
  return <>{children}</>;
}

export function FullPageMessage({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="max-w-md font-serif text-xl text-reu">{children}</p>
      {action}
    </div>
  );
}
