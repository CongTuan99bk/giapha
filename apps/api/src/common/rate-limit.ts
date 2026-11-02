import { parseLoginId } from "@coinguon/schemas";
import { type CanActivate, type ExecutionContext, Inject, Injectable, type OnModuleDestroy, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { AppError } from "./errors.js";

export interface RateRule {
  /** Số lần tối đa trong cửa sổ */
  limit: number;
  windowSec: number;
  /** Đếm thêm theo một trường trong body (vd. "email"; nhiều tên thì lấy trường đầu tiên có giá trị) — chặn dò một tài khoản từ nhiều IP */
  bodyField?: string | string[];
  /** Giới hạn riêng cho bucket theo trường body (mặc định = limit) */
  fieldLimit?: number;
}

export const RATE_LIMIT = "coinguon:rateLimit";
/** Giới hạn tần suất theo IP (và tuỳ chọn theo một trường body) cho một route. */
export const RateLimit = (name: string, rule: RateRule) => SetMetadata(RATE_LIMIT, { name, ...rule });

/** Lấy IP người dùng: header của proxy tin cậy (nếu cấu hình), nếu không thì req.ip (đã xét "trust proxy"). */
export function clientIp(req: Request, header?: string): string {
  if (header) {
    const v = req.header(header);
    if (v) return v.split(",")[0]!.trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Bộ đếm trong bộ nhớ (cửa sổ cố định). Đủ cho một tiến trình API (VPS/Docker một máy);
 * chạy nhiều bản API thì chuyển sang Redis (KI-010).
 */
@Injectable()
export class RateLimitStore implements OnModuleDestroy {
  private readonly buckets = new Map<string, Bucket>();
  private readonly timer = setInterval(() => this.sweep(), 60_000).unref();

  /** Tăng bộ đếm; trả về số giây phải chờ nếu vượt giới hạn, 0 nếu còn được phép. */
  hit(key: string, limit: number, windowSec: number, now = Date.now()): number {
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowSec * 1000 };
      this.buckets.set(key, b);
    }
    b.count++;
    return b.count > limit ? Math.ceil((b.resetAt - now) / 1000) : 0;
  }

  private sweep(now = Date.now()) {
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: RateLimitStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (this.config.RATE_LIMIT === "off") return true;
    // đặt ở hàm hoặc cả controller (hàm ưu tiên)
    const rule = this.reflector.getAllAndOverride<(RateRule & { name: string }) | undefined>(RATE_LIMIT, [ctx.getHandler(), ctx.getClass()]);
    if (!rule) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const ip = clientIp(req, this.config.CLIENT_IP_HEADER);
    let wait = this.store.hit(`${rule.name}:ip:${ip}`, rule.limit, rule.windowSec);
    if (!wait && rule.bodyField) {
      const body = req.body as Record<string, unknown> | undefined;
      const raw = [rule.bodyField].flat().map((f) => body?.[f]).find((v) => typeof v === "string" && v.trim());
      if (typeof raw === "string") {
        // cùng một tài khoản dù gõ "0912 345 678" hay "+84912345678"
        const id = parseLoginId(raw);
        const key = id?.email ?? id?.phone ?? raw.trim().toLowerCase();
        wait = this.store.hit(`${rule.name}:field:${key}`, rule.fieldLimit ?? rule.limit, rule.windowSec);
      }
    }
    if (wait) {
      ctx.switchToHttp().getResponse<Response>().setHeader("Retry-After", String(wait));
      const minutes = Math.max(1, Math.ceil(wait / 60));
      throw new AppError(429, "TOO_MANY_REQUESTS", `Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ${minutes} phút.`, {
        retryAfterSec: wait,
      });
    }
    return true;
  }
}
