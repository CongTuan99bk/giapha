import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";
import { type CallHandler, type ExecutionContext, Inject, Injectable, type NestInterceptor, type OnModuleDestroy } from "@nestjs/common";
import type { Request, Response } from "express";
import { type Observable, tap } from "rxjs";
import { APP_CONFIG, type AppConfig } from "../config.js";

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

/** Dưới cỡ này nén không đáng (header + CPU nhiều hơn phần tiết kiệm) */
const MIN_COMPRESS_BYTES = 1024;

type Encoding = "br" | "gzip";

/** Phạm vi cho giá trị không thuộc riêng dòng họ nào (vd. dòng họ chính của trang công khai): xoá khi có bất kỳ thay đổi */
export const GLOBAL_SCOPE = "*";

/** Một phản hồi JSON đã dựng sẵn: chuỗi JSON, ETag và các bản nén (nén lần đầu có người cần) */
export interface CachedBody {
  json: Buffer;
  etag: string;
  encoded: Partial<Record<Encoding, Promise<Buffer>>>;
}

interface Entry {
  clanId: string;
  value: Promise<unknown>;
  bytes: number;
  expiresAt: number;
}

/**
 * Bộ nhớ đệm trong tiến trình cho các trang đọc nhiều, ghi ít (phả đồ, lịch giỗ, trang công khai).
 *
 * - Mỗi dòng họ có một "phiên bản" tăng sau mỗi thao tác ghi thành công (CacheInvalidator) →
 *   khoá cache chứa phiên bản nên dữ liệu cũ không bao giờ được trả lại sau khi đã sửa.
 * - Nhiều yêu cầu cùng lúc cho cùng một khoá chỉ tính MỘT lần (dùng chung Promise).
 * - Giới hạn dung lượng (LRU) và thời hạn (an toàn khi dữ liệu bị sửa ngoài API, vd. script nhập liệu).
 * - Chỉ đúng khi chạy MỘT bản API (KI-028). Nhiều bản thì cần kênh báo xoá cache chung (Redis pub/sub).
 */
@Injectable()
export class ResponseCache implements OnModuleDestroy {
  private readonly versions = new Map<string, number>();
  /** Map giữ thứ tự chèn → phần tử đầu là ít dùng nhất (LRU) */
  private readonly entries = new Map<string, Entry>();
  private bytes = 0;
  private readonly maxBytes: number;
  private readonly ttlMs: number;
  private readonly enabled: boolean;
  private readonly timer: NodeJS.Timeout;
  /** Đếm để xem trong /health và khi đo tải */
  readonly stats = { hits: 0, misses: 0, evictions: 0 };

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.maxBytes = config.CACHE_MAX_MB * 1024 * 1024;
    this.ttlMs = config.CACHE_TTL_SEC * 1000;
    this.enabled = config.CACHE_MAX_MB > 0;
    this.timer = setInterval(() => this.sweep(), 60_000).unref();
  }

  version(clanId: string): number {
    return this.versions.get(clanId) ?? 0;
  }

  /** Dữ liệu dòng họ vừa đổi: bỏ mọi kết quả cũ của dòng họ đó (và kết quả dùng chung, vd. dòng họ chính) */
  bump(clanId: string): void {
    this.versions.set(clanId, this.version(clanId) + 1);
    for (const [k, e] of this.entries) if (e.clanId === clanId || e.clanId === GLOBAL_SCOPE) this.drop(k, e);
  }

  /** Dòng họ mới được tạo / đổi dòng họ chính: xoá hết */
  clear(): void {
    for (const id of this.versions.keys()) this.versions.set(id, this.version(id) + 1);
    this.entries.clear();
    this.bytes = 0;
  }

  /**
   * Lấy giá trị đã nhớ hoặc tính bằng `build` (một lần cho mọi yêu cầu đang chờ cùng khoá).
   * `sizeOf` ước lượng số byte để giới hạn bộ nhớ.
   */
  memo<T>(clanId: string, key: string, build: () => Promise<T>, opts: { ttlMs?: number; sizeOf?: (v: T) => number } = {}): Promise<T> {
    if (!this.enabled) return build();
    const full = `${clanId}:${this.version(clanId)}:${key}`;
    const now = Date.now();
    const hit = this.entries.get(full);
    if (hit && hit.expiresAt > now) {
      this.stats.hits++;
      // làm mới vị trí LRU
      this.entries.delete(full);
      this.entries.set(full, hit);
      return hit.value as Promise<T>;
    }
    if (hit) this.drop(full, hit);
    this.stats.misses++;
    const entry: Entry = {
      clanId,
      value: Promise.resolve(),
      bytes: 0,
      expiresAt: now + (opts.ttlMs ?? this.ttlMs),
    };
    const value = build().then(
      (v) => {
        // vẫn còn trong cache (chưa bị bump/đẩy ra) thì tính dung lượng thật
        if (this.entries.get(full) === entry) {
          entry.bytes = opts.sizeOf ? opts.sizeOf(v) : 1024;
          this.bytes += entry.bytes;
          this.evict();
        }
        return v;
      },
      (err: unknown) => {
        // lỗi không được nhớ: yêu cầu sau thử lại
        if (this.entries.get(full) === entry) this.drop(full, entry);
        throw err;
      },
    );
    entry.value = value;
    this.entries.set(full, entry);
    return value;
  }

  /** Như `memo` nhưng nhớ luôn chuỗi JSON + ETag (và bản nén) để gửi đi không phải dựng lại */
  json(clanId: string, key: string, build: () => Promise<unknown>, opts: { ttlMs?: number } = {}): Promise<CachedBody> {
    return this.memo(clanId, `json:${key}`, async () => toCachedBody(await build()), { ...opts, sizeOf: (b) => b.json.length * 1.4 });
  }

  private drop(key: string, e: Entry) {
    this.entries.delete(key);
    this.bytes -= e.bytes;
  }

  private evict() {
    for (const [k, e] of this.entries) {
      if (this.bytes <= this.maxBytes) break;
      this.drop(k, e);
      this.stats.evictions++;
    }
  }

  private sweep(now = Date.now()) {
    for (const [k, e] of this.entries) if (e.expiresAt <= now) this.drop(k, e);
  }

  get size() {
    return { entries: this.entries.size, bytes: this.bytes };
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }
}

export function toCachedBody(value: unknown): CachedBody {
  const json = Buffer.from(JSON.stringify(value));
  const etag = `"${createHash("sha1").update(json).digest("base64url").slice(0, 27)}"`;
  return { json, etag, encoded: {} };
}

function encode(body: CachedBody, enc: Encoding): Promise<Buffer> {
  body.encoded[enc] ??= (
    enc === "br"
      ? // mức 5: nhanh gần bằng gzip mà nhỏ hơn rõ; nén một lần dùng cho mọi người xem
        brotliAsync(body.json, {
          params: {
            [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
            [zlibConstants.BROTLI_PARAM_SIZE_HINT]: body.json.length,
            [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
          },
        })
      : gzipAsync(body.json, { level: 6 })
  ).catch((err: unknown) => {
    delete body.encoded[enc];
    throw err;
  });
  return body.encoded[enc]!;
}

/**
 * Gửi phản hồi đã nhớ: trả 304 nếu trình duyệt đã có bản này (ETag), nén br/gzip theo Accept-Encoding.
 * `cacheControl`: "no-cache" = trình duyệt được giữ nhưng luôn hỏi lại (rẻ nhờ 304) → sửa xong thấy ngay.
 */
export async function sendCached(req: Request, res: Response, body: CachedBody, cacheControl: string): Promise<void> {
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("ETag", body.etag);
  res.setHeader("Vary", "Accept-Encoding");
  const inm = req.headers["if-none-match"];
  if (inm && inm.split(",").some((t) => t.trim().replace(/^W\//, "") === body.etag)) {
    res.status(304).end();
    return;
  }
  res.type("application/json; charset=utf-8");
  let payload = body.json;
  if (body.json.length >= MIN_COMPRESS_BYTES) {
    const enc = req.acceptsEncodings("br", "gzip", "identity");
    if (enc === "br" || enc === "gzip") {
      payload = await encode(body, enc);
      res.setHeader("Content-Encoding", enc);
    }
  }
  res.setHeader("Content-Length", String(payload.length));
  res.end(req.method === "HEAD" ? undefined : payload);
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Sau mỗi thao tác ghi THÀNH CÔNG (transaction đã commit) dưới /clans/:clanId → tăng phiên bản cache dòng họ đó.
 * Tạo dòng họ mới (/clans) → xoá hết. Đăng nhập, đăng ký, xin vào họ không đổi dữ liệu đang nhớ.
 */
@Injectable()
export class CacheInvalidator implements NestInterceptor {
  constructor(private readonly cache: ResponseCache) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!MUTATING.has(req.method)) return next.handle();
    return next.handle().pipe(
      tap(() => {
        const clanId = (req.params as Record<string, string | undefined>).clanId;
        if (clanId) this.cache.bump(clanId);
        else if (/^\/api\/v1\/clans\/?$/.test(req.path)) this.cache.clear();
      }),
    );
  }
}
