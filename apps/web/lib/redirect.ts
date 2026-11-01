/** Chỉ cho phép quay về đường dẫn nội bộ (chống chuyển hướng sang trang lạ: "//evil.com", "https://…"). */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
