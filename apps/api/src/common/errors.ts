import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";

/** Lỗi nghiệp vụ có mã ổn định — client dựa vào `code`, không dựa vào câu chữ. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Không tìm thấy") => new AppError(404, "NOT_FOUND", what);
export const forbidden = (code = "FORBIDDEN", message = "Bạn không có quyền thực hiện thao tác này") =>
  new AppError(403, code, message);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);
export const unprocessable = (code: string, message: string, details?: unknown) =>
  new AppError(422, code, message, details);

/** Lỗi do trigger/ràng buộc PostgreSQL ném ra → mã lỗi nghiệp vụ */
const PG_TRIGGER_CODES: Record<string, string> = {
  ANCESTOR_CYCLE: "Thêm quan hệ này sẽ tạo vòng lặp tổ tiên",
  SELF_PARENT: "Một người không thể là cha/mẹ của chính mình",
  CROSS_CLAN_REFERENCE: "Không thể nối người của dòng họ khác",
};

interface PgError {
  code?: string;
  message: string;
  constraint?: string;
}

/**
 * Chuẩn hoá mọi lỗi về `{ code, message, details }` (tài liệu đặc tả mục 9.1).
 * Lỗi không lường trước trả 500 với câu chung chung, chi tiết chỉ ghi log.
 */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("ErrorFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toBody(exception);
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(status).json(body);
  }

  private toBody(e: unknown): { status: number; body: { code: string; message: string; details?: unknown } } {
    if (e instanceof AppError) {
      return { status: e.status, body: { code: e.code, message: e.message, details: e.details } };
    }
    if (e instanceof ZodError) {
      return {
        status: 422,
        body: {
          code: "VALIDATION_FAILED",
          message: "Dữ liệu không hợp lệ",
          details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const code = status === 404 ? "NOT_FOUND" : status === 401 ? "UNAUTHENTICATED" : HttpStatus[status] ?? "HTTP_ERROR";
      return { status, body: { code, message: e.message } };
    }
    const pgErr = e as PgError;
    if (pgErr && typeof pgErr.code === "string") {
      if (pgErr.code === "23514") {
        const key = Object.keys(PG_TRIGGER_CODES).find((k) => pgErr.message.startsWith(k));
        if (key) return { status: 422, body: { code: key, message: PG_TRIGGER_CODES[key]! } };
        return { status: 422, body: { code: "CONSTRAINT_VIOLATION", message: "Dữ liệu vi phạm ràng buộc", details: pgErr.constraint } };
      }
      if (pgErr.code === "23505") {
        return { status: 409, body: { code: "DUPLICATE", message: "Dữ liệu bị trùng", details: pgErr.constraint } };
      }
      if (pgErr.code === "42501") {
        return { status: 403, body: { code: "FORBIDDEN", message: "Bạn không có quyền truy cập dữ liệu này" } };
      }
    }
    return { status: 500, body: { code: "INTERNAL", message: "Có lỗi xảy ra, vui lòng thử lại" } };
  }
}
