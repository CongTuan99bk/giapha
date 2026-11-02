/**
 * Gọi API cùng origin (`/api/v1`, Next chuyển tiếp sang NestJS).
 * Request ghi tự gửi header X-CSRF-Token lấy từ cookie `csrf` (double-submit).
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function readCookie(name: string, cookieString: string = typeof document === "undefined" ? "" : document.cookie) {
  for (const part of cookieString.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    const csrf = readCookie("csrf");
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(res.status, e.code ?? "HTTP_" + res.status, e.message ?? "Có lỗi xảy ra, vui lòng thử lại.", e.details);
  }
  return data as T;
}

/** Lấy thông báo lỗi theo từng trường từ lỗi 422 VALIDATION_FAILED (zod issues). */
export function fieldErrors(err: unknown): Record<string, string> {
  // Lỗi kiểm tra dữ liệu (422) và lỗi trùng (409 EMAIL_TAKEN…) đều có thể kèm danh sách { path, message } theo từng ô
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return {};
  const out: Record<string, string> = {};
  for (const issue of err.details as Array<{ path?: string | Array<string | number>; message?: string }>) {
    const key = Array.isArray(issue.path) ? issue.path.join(".") : (issue.path ?? "");
    if (key && !out[key]) out[key] = issue.message ?? "Không hợp lệ";
  }
  return out;
}
