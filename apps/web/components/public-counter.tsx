"use client";

import { usePublicCounter } from "@/lib/public";

/** Dòng nhỏ cuối trang công khai: bao nhiêu người đang xem, hôm nay, tổng cộng */
export function PublicCounter() {
  const c = usePublicCounter().data;
  if (!c) return null;
  const n = (v: number) => v.toLocaleString("vi-VN");
  return (
    <p className="mt-12 border-t border-ngoc-200 pt-4 text-center text-sm text-reu">
      Đang xem: <span className="tabular-nums">{n(c.online)}</span> · Hôm nay: <span className="tabular-nums">{n(c.today)}</span> lượt · Tổng cộng:{" "}
      <span className="tabular-nums">{n(c.total)}</span> lượt xem
    </p>
  );
}
