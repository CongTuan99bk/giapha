"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { readCookie } from "@/lib/api";

const VISITOR_KEY = "coinguon:khach";
const HEARTBEAT_MS = 30_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mã khách ngẫu nhiên, chỉ để đếm "bao nhiêu người" — không gắn với tên hay tài khoản */
function visitorId(): string {
  try {
    const saved = localStorage.getItem(VISITOR_KEY);
    if (saved && /^[A-Za-z0-9_-]{10,32}$/.test(saved)) return saved;
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const fresh = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    localStorage.setItem(VISITOR_KEY, fresh);
    return fresh;
  } catch {
    // trình duyệt chặn lưu trữ (chế độ riêng tư): mỗi lần mở trang là một khách
    return (memoryId ??= Math.random().toString(36).slice(2, 14).padEnd(12, "0"));
  }
}
let memoryId: string | undefined;

function send(kind: "pv" | "hb", body: Record<string, unknown>) {
  // keepalive: vẫn gửi được khi người dùng vừa bấm sang trang khác
  void fetch(`/api/v1/t/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
    credentials: "omit",
  }).catch(() => undefined);
}

/**
 * Báo máy chủ "có người mở trang" và "vẫn đang xem" (30 giây/lần khi tab đang hiện).
 * Ban quản lý xem số liệu ở mục Thống kê; trang công khai hiện bộ đếm nhỏ.
 */
export function VisitTracker() {
  const path = usePathname();
  const params = useSearchParams();
  const person = params.get("nguoi");
  const firstView = useRef(true);

  useEffect(() => {
    const base = { h: location.hostname, v: visitorId(), p: path, m: readCookie("csrf") ? 1 : 0 };
    // nguồn chỉ có ý nghĩa ở lần mở đầu tiên (từ Zalo, Facebook, Google…)
    const referrer = firstView.current && document.referrer ? document.referrer : undefined;
    firstView.current = false;
    send("pv", { ...base, ...(referrer && { r: referrer }), ...(person && UUID.test(person) && { pid: person }) });

    const beat = () => {
      if (document.visibilityState === "visible") send("hb", { ...base, m: readCookie("csrf") ? 1 : 0 });
    };
    const timer = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [path, person]);

  return null;
}
