import { ApiError, readCookie } from "./api";
import type { MediaItem } from "./types";

export const MAX_UPLOAD_MB = 15;
const ACCEPTED = /^image\/(jpeg|png|webp|avif|tiff|gif)$/;

/** Kiểm tra trước khi tải để báo lỗi ngay, không tốn mạng. Trả về câu lỗi hoặc null. */
export function checkImageFile(file: { type: string; size: number; name: string }): string | null {
  if (/\.hei[cf]$/i.test(file.name) || /image\/hei[cf]/.test(file.type)) {
    return `"${file.name}" là ảnh HEIC của iPhone, hệ thống chưa đọc được. Hãy chọn ảnh từ điện thoại qua trình duyệt (iPhone tự đổi sang JPG), hoặc đổi trên iPhone: Cài đặt → Camera → Định dạng → Tương thích nhất.`;
  }
  const looksLikeImage = ACCEPTED.test(file.type) || /\.(jpe?g|png|webp|avif|tiff?|gif)$/i.test(file.name);
  if (!looksLikeImage) return `"${file.name}" không phải ảnh. Hãy chọn ảnh JPG, PNG hoặc WebP.`;
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `"${file.name}" lớn hơn ${MAX_UPLOAD_MB} MB. Hãy chọn ảnh nhỏ hơn.`;
  return null;
}

/** Tải một ảnh lên thư viện của dòng họ (multipart, kèm header CSRF). */
export async function uploadImage(clanId: string, file: File, caption?: string, albumId?: string): Promise<MediaItem> {
  const problem = checkImageFile(file);
  if (problem) throw new ApiError(422, "UNSUPPORTED_IMAGE", problem);
  const form = new FormData();
  form.append("file", file);
  if (caption) form.append("caption", caption);
  if (albumId) form.append("albumId", albumId);
  const headers: Record<string, string> = { Accept: "application/json" };
  const csrf = readCookie("csrf");
  if (csrf) headers["X-CSRF-Token"] = csrf;
  let res: Response;
  try {
    res = await fetch(`/api/v1/clans/${clanId}/media`, { method: "POST", body: form, headers, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "NETWORK", "Mất kết nối khi tải ảnh. Kiểm tra mạng rồi thử lại.");
  }
  const data = (await res.json().catch(() => null)) as (MediaItem & { code?: string; message?: string }) | null;
  if (!res.ok) throw new ApiError(res.status, data?.code ?? `HTTP_${res.status}`, data?.message ?? "Không tải được ảnh.");
  return data as MediaItem;
}

/** Đường dẫn ảnh theo cỡ (API kiểm tra quyền xem bằng cookie phiên) */
export const mediaUrl = (clanId: string, mediaId: string, variant: "sm" | "md" | "lg" | "orig") =>
  `/api/v1/clans/${clanId}/media/${mediaId}/${variant}`;
