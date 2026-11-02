"use client";

import { useEffect, useState } from "react";

/**
 * true sau khi React đã gắn sự kiện trên trình duyệt. Dùng để khoá nút gửi form cho tới lúc đó:
 * bấm quá sớm (mạng chậm, máy yếu) thì trình duyệt tự gửi form kiểu cũ (GET, lộ email lên thanh địa chỉ) và mất dữ liệu.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
