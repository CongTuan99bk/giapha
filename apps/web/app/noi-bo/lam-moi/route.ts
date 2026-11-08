import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

/**
 * Làm mới trang công khai đã dựng sẵn (tên dòng họ, ảnh xem trước khi chia sẻ link).
 * Chỉ chính máy chủ web gọi lúc vừa khởi động (instrumentation.ts), có mã bí mật sinh ngẫu nhiên mỗi lần chạy.
 */
export function POST(req: Request) {
  const token = (globalThis as { __coinguonRefreshToken?: string }).__coinguonRefreshToken;
  if (!token || req.headers.get("x-lam-moi") !== token) return new Response(null, { status: 404 });
  revalidatePath("/");
  revalidatePath("/xem", "layout");
  return new Response(null, { status: 204 });
}
