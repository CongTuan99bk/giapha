import { dailyRangeSchema, heartbeatSchema, isBotUserAgent, pageViewSchema, statDateVN } from "@coinguon/schemas";
import { Body, Controller, Get, HttpCode, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { CurrentMembership, type Membership, MinRole, Public } from "../common/context.js";
import { RateLimit } from "../common/rate-limit.js";
import { ResponseCache } from "../common/response-cache.js";
import { MainClanService } from "../public/main-clan.service.js";
import { AnalyticsService } from "./analytics.service.js";

/**
 * Trình duyệt báo "đang xem" (30 giây/lần) và "mở trang". Luôn trả 204, kể cả khi bỏ qua (bot, nhiều dòng họ):
 * không để việc thống kê làm chậm hay báo lỗi trên trang.
 */
@Public()
// một nhà thờ họ đông người dùng chung wifi: 100 máy × (tín hiệu 30 giây/lần + mở trang) trong 5 phút
@RateLimit("track", { limit: 3000, windowSec: 300 })
@Controller("t")
export class TrackController {
  constructor(
    private readonly stats: AnalyticsService,
    private readonly clans: MainClanService,
  ) {}

  @Post("hb")
  @HttpCode(204)
  async heartbeat(@Body() body: unknown, @Req() req: Request): Promise<void> {
    const hb = heartbeatSchema.parse(body);
    if (isBotUserAgent(req.header("user-agent"))) return;
    const clan = await this.clans.find();
    if (clan) this.stats.heartbeat(clan.id, hb.v, hb.p, hb.m === 1);
  }

  @Post("pv")
  @HttpCode(204)
  async pageView(@Body() body: unknown, @Req() req: Request): Promise<void> {
    const pv = pageViewSchema.parse(body);
    const ua = req.header("user-agent");
    if (isBotUserAgent(ua)) return;
    const clan = await this.clans.find();
    if (!clan) return;
    // nguồn là chính trang web mình thì không tính là "nguồn truy cập"
    const referrer = pv.r && pv.r !== pv.h ? pv.r : null;
    this.stats.pageView(clan.id, { visitor: pv.v, path: pv.p, member: pv.m === 1, referrer, personId: pv.pid ?? null, userAgent: ua! });
  }
}

/** Bộ đếm nhỏ ở chân trang công khai */
@Public()
@RateLimit("public", { limit: 3000, windowSec: 300 })
@Controller("public")
export class PublicStatsController {
  constructor(
    private readonly stats: AnalyticsService,
    private readonly clans: MainClanService,
    private readonly cache: ResponseCache,
  ) {}

  @Get("stats")
  async counter() {
    const clan = await this.clans.get();
    // nhớ 30 giây: đông khách cùng mở trang cũng chỉ một truy vấn
    return this.cache.memo(clan.id, `public:counter:${statDateVN()}`, () => this.stats.counter(clan.id), { ttlMs: 30_000, sizeOf: () => 200 });
  }
}

/** Thống kê cho ban quản lý (FR-STAT-02..05) */
@Controller("clans/:clanId/stats")
export class StatsController {
  constructor(private readonly stats: AnalyticsService) {}

  @Get("live")
  @MinRole("admin")
  live(@CurrentMembership() m: Membership) {
    return this.stats.liveStats(m.clanId);
  }

  @Get("daily")
  @MinRole("admin")
  daily(@CurrentMembership() m: Membership, @Query() raw: unknown) {
    const { from, to } = dailyRangeSchema.parse(raw);
    return this.stats.daily(m.clanId, from, to);
  }
}
