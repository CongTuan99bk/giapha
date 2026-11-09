import { ApiError, readCookie } from "./api";
import type { ImportCheck, MediaItem, SiteMusic } from "./types";

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
export const mediaUrl = (clanId: string, mediaId: string, variant: "sm" | "md" | "lg" | "orig") => `/api/v1/clans/${clanId}/media/${mediaId}/${variant}`;

/** Tải file Excel lên để kiểm tra (chưa ghi gì vào phả) */
export async function uploadImportFile(clanId: string, file: File): Promise<ImportCheck> {
  if (!/\.xlsx$/i.test(file.name)) {
    throw new ApiError(422, "NOT_XLSX", `“${file.name}” không phải file Excel .xlsx. Trong Excel chọn Lưu thành → Sổ làm việc Excel (.xlsx).`);
  }
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = { Accept: "application/json" };
  const csrf = readCookie("csrf");
  if (csrf) headers["X-CSRF-Token"] = csrf;
  let res: Response;
  try {
    res = await fetch(`/api/v1/clans/${clanId}/imports`, { method: "POST", body: form, headers, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "NETWORK", "Mất kết nối khi tải file. Kiểm tra mạng rồi thử lại.");
  }
  const data = (await res.json().catch(() => null)) as (ImportCheck & { code?: string; message?: string }) | null;
  if (!res.ok) throw new ApiError(res.status, data?.code ?? `HTTP_${res.status}`, data?.message ?? "Không kiểm tra được file.");
  return data as ImportCheck;
}

export const MAX_MUSIC_MB = 20;

/** Kiểm tra file nhạc trước khi tải (máy chủ vẫn kiểm tra lại bằng nội dung file) */
export function checkMusicFile(file: { type: string; size: number; name: string }): string | null {
  const ok = /^audio\//.test(file.type) || /\.(mp3|m4a|aac|mp4|ogg|oga|wav)$/i.test(file.name);
  if (!ok) return `"${file.name}" không phải file nhạc. Hãy chọn file MP3, M4A, OGG hoặc WAV.`;
  if (file.size > MAX_MUSIC_MB * 1024 * 1024)
    return `"${file.name}" lớn hơn ${MAX_MUSIC_MB} MB. Hãy chọn bản nhạc nhỏ hơn (MP3 128 kbps khoảng 1 MB mỗi phút).`;
  return null;
}

/** Thay nhạc nền của dòng họ (multipart PUT, kèm header CSRF) */
export async function uploadMusic(clanId: string, file: File, title: string): Promise<{ music: SiteMusic }> {
  const problem = checkMusicFile(file);
  if (problem) throw new ApiError(422, "NOT_AUDIO", problem);
  const form = new FormData();
  form.append("file", file);
  if (title.trim()) form.append("title", title.trim());
  const headers: Record<string, string> = { Accept: "application/json" };
  const csrf = readCookie("csrf");
  if (csrf) headers["X-CSRF-Token"] = csrf;
  let res: Response;
  try {
    res = await fetch(`/api/v1/clans/${clanId}/site/music`, { method: "PUT", body: form, headers, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "NETWORK", "Mất kết nối khi tải nhạc. Kiểm tra mạng rồi thử lại.");
  }
  const data = (await res.json().catch(() => null)) as { music: SiteMusic; code?: string; message?: string; details?: unknown } | null;
  if (!res.ok) throw new ApiError(res.status, data?.code ?? `HTTP_${res.status}`, data?.message ?? "Không tải được nhạc.", data?.details);
  return data as { music: SiteMusic };
}
