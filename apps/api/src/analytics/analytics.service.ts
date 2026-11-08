import { createHash } from "node:crypto";
import { type DailyStat, deviceTypeOf, type LiveStats, statDateVN } from "@coinguon/schemas";
import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { sql } from "kysely";
import { Database } from "../db/database.js";

/** Một khách được coi là "đang xem" nếu gửi tín hiệu trong khoảng này (trình duyệt gửi 30 giây/lần) */
const ONLINE_WINDOW_MS = 90_000;
/** Ghi số đếm xuống cơ sở dữ liệu mỗi phút: đông người xem cũng chỉ một lần ghi/phút */
const FLUSH_EVERY_MS = 60_000;
/** Giới hạn số khoá chi tiết (trang, nguồn, người) mỗi ngày để kẻ xấu không làm phình bộ nhớ */
const MAX_DIM_KEYS_PER_DAY = 2000;

type Dimension = "page" | "person" | "referrer" | "device";

interface DayCounter {
  pageViews: number;
  memberViews: number;
  /** Khách mới trong ngày chưa ghi xuống DB */
  newVisitors: number;
  dims: Map<string, number>; // "dimension\u0000key" → lượt
}

export interface PageViewInput {
  visitor: string;
  path: string;
  member: boolean;
  referrer: string | null;
  personId: string | null;
  userAgent: string;
}

/**
 * Thống kê truy cập (FR-STAT): đang xem (trong bộ nhớ) và số lượt theo ngày (gom rồi ghi mỗi phút).
 * Không lưu IP; mã khách là chuỗi ngẫu nhiên trong trình duyệt, chỉ giữ bản băm trong bộ nhớ để đếm khách duy nhất.
 * Chỉ đúng khi chạy một bản API (giống bộ nhớ đệm — KI-028). Khởi động lại giữa ngày: khách quay lại có thể bị đếm thêm một lần.
 */
@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  private readonly logger = new Logger("ThongKe");
  /** clanId → (mã khách → lần cuối, trang, có phải thành viên) */
  private readonly live = new Map<string, Map<string, { at: number; path: string; member: boolean }>>();
  /** "clanId|ngày" → số đếm chưa ghi */
  private readonly pending = new Map<string, DayCounter>();
  /** "clanId|ngày" → các khách đã gặp trong ngày (bản băm ngắn) */
  private readonly seen = new Map<string, Set<string>>();
  private readonly timer = setInterval(() => void this.flush().catch((err: unknown) => this.logger.error(String(err))), FLUSH_EVERY_MS).unref();
  private flushing: Promise<void> | null = null;

  constructor(private readonly db: Database) {}

  heartbeat(clanId: string, visitor: string, path: string, member: boolean, now = Date.now()): void {
    let m = this.live.get(clanId);
    if (!m) this.live.set(clanId, (m = new Map()));
    m.set(hashVisitor(visitor), { at: now, path, member });
  }

  pageView(clanId: string, v: PageViewInput, now = new Date()): void {
    this.heartbeat(clanId, v.visitor, v.path, v.member, now.getTime());
    const date = statDateVN(now);
    const key = `${clanId}|${date}`;
    let c = this.pending.get(key);
    if (!c) this.pending.set(key, (c = { pageViews: 0, memberViews: 0, newVisitors: 0, dims: new Map() }));
    c.pageViews++;
    if (v.member) c.memberViews++;

    let seen = this.seen.get(key);
    if (!seen) {
      this.seen.set(key, (seen = new Set()));
      this.forgetOldDays(date);
    }
    const id = hashVisitor(v.visitor);
    if (!seen.has(id)) {
      seen.add(id);
      c.newVisitors++;
    }

    const add = (dim: Dimension, k: string | null) => {
      if (!k) return;
      const dk = `${dim}\u0000${k.slice(0, 200)}`;
      if (!c.dims.has(dk) && c.dims.size >= MAX_DIM_KEYS_PER_DAY) return;
      c.dims.set(dk, (c.dims.get(dk) ?? 0) + 1);
    };
    add("page", normalizePath(v.path));
    add("device", deviceTypeOf(v.userAgent));
    add("referrer", v.referrer);
    add("person", v.personId);
  }

  liveStats(clanId: string, now = Date.now()): LiveStats {
    const m = this.live.get(clanId) ?? new Map();
    let guests = 0;
    let members = 0;
    const pages = new Map<string, number>();
    for (const [id, e] of m) {
      if (now - e.at > ONLINE_WINDOW_MS) {
        m.delete(id);
        continue;
      }
      if (e.member) members++;
      else guests++;
      const p = normalizePath(e.path);
      pages.set(p, (pages.get(p) ?? 0) + 1);
    }
    return {
      online: guests + members,
      guests,
      members,
      pages: [...pages]
        .map(([path, online]) => ({ path, online }))
        .sort((a, b) => b.online - a.online)
        .slice(0, 10),
      at: new Date(now).toISOString(),
    };
  }

  /** Ghi các số đếm đang gom xuống DB (cộng dồn). Gọi định kỳ, trước khi xem báo cáo và khi tắt máy chủ. */
  flush(): Promise<void> {
    // không chạy chồng hai lần ghi
    this.flushing ??= this.doFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async doFlush(): Promise<void> {
    const batch = [...this.pending];
    this.pending.clear();
    let failure: unknown = null;
    for (const [key, c] of batch) {
      const [clanId, date] = key.split("|") as [string, string];
      try {
        await this.db.withClan({ clanId, userId: null }, async (trx) => {
          await sql`
            insert into analytics_daily (clan_id, date, page_views, unique_visitors, member_views)
            values (${clanId}::uuid, ${date}::date, ${c.pageViews}, ${c.newVisitors}, ${c.memberViews})
            on conflict (clan_id, date) do update set
              page_views = analytics_daily.page_views + excluded.page_views,
              unique_visitors = analytics_daily.unique_visitors + excluded.unique_visitors,
              member_views = analytics_daily.member_views + excluded.member_views
          `.execute(trx);
          const rows = [...c.dims].map(([dk, views]) => {
            const [dimension, k] = dk.split("\u0000") as [Dimension, string];
            return sql`(${clanId}::uuid, ${date}::date, ${dimension}::"AnalyticsDimension", ${k}, ${views})`;
          });
          for (let i = 0; i < rows.length; i += 500) {
            await sql`
              insert into analytics_dims (clan_id, date, dimension, key, views)
              values ${sql.join(rows.slice(i, i + 500))}
              on conflict (clan_id, date, dimension, key) do update set views = analytics_dims.views + excluded.views
            `.execute(trx);
          }
        });
      } catch (err) {
        // ghi lỗi (vd. mất kết nối DB): trả số đếm lại để lần sau ghi tiếp
        this.merge(key, c);
        failure ??= err;
      }
    }
    if (failure) throw failure;
  }

  private merge(key: string, c: DayCounter) {
    const cur = this.pending.get(key);
    if (!cur) {
      this.pending.set(key, c);
      return;
    }
    cur.pageViews += c.pageViews;
    cur.memberViews += c.memberViews;
    cur.newVisitors += c.newVisitors;
    for (const [k, n] of c.dims) cur.dims.set(k, (cur.dims.get(k) ?? 0) + n);
  }

  /** Bỏ danh sách khách của những ngày đã qua (chỉ cần để đếm khách duy nhất trong ngày) */
  private forgetOldDays(today: string) {
    for (const key of this.seen.keys()) if (!key.endsWith(`|${today}`)) this.seen.delete(key);
  }

  async daily(clanId: string, from: string, to: string) {
    await this.flush();
    return this.db.withClan({ clanId, userId: null }, async (trx) => {
      const days = await trx
        .selectFrom("analytics_daily")
        .select(["date", "page_views", "unique_visitors", "member_views"])
        .where("date", ">=", from as never)
        .where("date", "<=", to as never)
        .orderBy("date")
        .execute();
      const top = await trx
        .selectFrom("analytics_dims")
        .select((eb) => ["dimension", "key", eb.fn.sum<string>("views").as("views")])
        .where("date", ">=", from as never)
        .where("date", "<=", to as never)
        .groupBy(["dimension", "key"])
        .orderBy("views", "desc")
        .execute();
      const total = await trx
        .selectFrom("analytics_daily")
        .select((eb) => [eb.fn.sum<string>("page_views").as("views")])
        .executeTakeFirst();
      const pick = (dim: Dimension, n: number) =>
        top
          .filter((t) => t.dimension === dim)
          .slice(0, n)
          .map((t) => ({ key: t.key, views: Number(t.views) }));
      const persons = pick("person", 10);
      const names = persons.length
        ? await trx
            .selectFrom("persons")
            .select(["id", "full_name"])
            .where(
              "id",
              "in",
              persons.map((p) => p.key),
            )
            .execute()
        : [];
      const nameOf = new Map(names.map((n) => [n.id, n.full_name]));
      const series: DailyStat[] = days.map((d) => ({
        date: String(d.date),
        pageViews: d.page_views,
        uniqueVisitors: d.unique_visitors,
        memberViews: d.member_views,
      }));
      return {
        from,
        to,
        days: series,
        allTimeViews: Number(total?.views ?? 0),
        pages: pick("page", 10),
        referrers: pick("referrer", 10),
        devices: pick("device", 3),
        persons: persons.filter((p) => nameOf.has(p.key)).map((p) => ({ ...p, fullName: nameOf.get(p.key)! })),
      };
    });
  }

  /** Số hiện công khai ở chân trang: đang xem, hôm nay, tổng cộng */
  async counter(clanId: string) {
    const live = this.liveStats(clanId);
    const today = statDateVN();
    const pendingToday = this.pending.get(`${clanId}|${today}`)?.pageViews ?? 0;
    const pendingAll = [...this.pending].filter(([k]) => k.startsWith(`${clanId}|`)).reduce((n, [, c]) => n + c.pageViews, 0);
    const row = await this.db.withClan({ clanId, userId: null }, (trx) =>
      trx
        .selectFrom("analytics_daily")
        .select((eb) => [
          eb.fn.sum<string>("page_views").as("all"),
          eb.fn
            .sum<string>(
              eb
                .case()
                .when("date", "=", today as never)
                .then(eb.ref("page_views"))
                .else(0)
                .end(),
            )
            .as("today"),
        ])
        .executeTakeFirst(),
    );
    return { online: live.online, today: Number(row?.today ?? 0) + pendingToday, total: Number(row?.all ?? 0) + pendingAll };
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.flush().catch((err: unknown) => this.logger.error(`Không ghi được thống kê khi tắt: ${String(err)}`));
  }
}

function hashVisitor(v: string): string {
  return createHash("sha1").update(v).digest("base64url").slice(0, 16);
}

/** Gộp đường dẫn hồ sơ / dòng họ cụ thể thành mẫu chung để báo cáo dễ đọc */
export function normalizePath(path: string): string {
  return (
    path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
      .replace(/\/+$/, "")
      .slice(0, 200) || "/"
  );
}
