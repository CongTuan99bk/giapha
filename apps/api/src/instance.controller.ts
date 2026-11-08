import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser, Public, type SessionUser } from "./common/context.js";
import { AppError } from "./common/errors.js";
import { RateLimit } from "./common/rate-limit.js";
import { APP_CONFIG, type AppConfig } from "./config.js";
import { Database } from "./db/database.js";
import { MembersService } from "./members/members.service.js";

const joinSchema = z.object({ message: z.string().trim().max(500).optional() }).strict();

/**
 * Thông tin công khai về bản cài đặt: chế độ một/nhiều dòng họ và dòng họ chính (chế độ single).
 * Giao diện dùng để biết cần hiện "Tạo dòng họ" (lần đầu) hay đi thẳng vào dòng họ.
 */
@Controller("instance")
export class InstanceController {
  constructor(
    private readonly db: Database,
    private readonly members: MembersService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async mainClan() {
    if (this.config.CLAN_MODE !== "single") return null;
    return (
      (await this.db.app
        .selectFrom("clans")
        .select(["id", "name", "slug", "surname"])
        .where("deleted_at", "is", null)
        .orderBy("created_at")
        .executeTakeFirst()) ?? null
    );
  }

  private async requireMainClan() {
    const clan = await this.mainClan();
    if (!clan) throw new AppError(404, "NO_MAIN_CLAN", "Chưa có dòng họ để xin tham gia");
    return clan;
  }

  /** Yêu cầu tham gia của tôi (chế độ một dòng họ): `{ request: null }` nếu chưa gửi */
  @Get("join-request")
  async myJoinRequest(@CurrentUser() user: SessionUser) {
    const clan = await this.requireMainClan();
    const req = await this.db.withClan({ clanId: clan.id, userId: user.id }, (trx) => this.members.myJoinRequest(trx, user.id));
    return { request: req };
  }

  /** Người tự đăng ký xin vào dòng họ; quản trị duyệt ở Cài đặt → Yêu cầu tham gia */
  @RateLimit("join-request", { limit: 40, windowSec: 3600 })
  @Post("join-request")
  async requestToJoin(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const { message } = joinSchema.parse(body ?? {});
    const clan = await this.requireMainClan();
    return this.db.withClan({ clanId: clan.id, userId: user.id }, (trx) => this.members.requestToJoin(trx, clan.id, user.id, message || null));
  }

  @Public()
  @Get()
  async get() {
    if (this.config.CLAN_MODE !== "single") return { clanMode: "multi" as const, clan: null };
    return { clanMode: "single" as const, clan: await this.mainClan() };
  }
}
