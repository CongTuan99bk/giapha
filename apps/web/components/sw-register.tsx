"use client";

import { useEffect } from "react";

/** Đăng ký service worker (chỉ bản production) để cài được PWA và có trang báo mất mạng. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
