import { Controller, Get, Inject } from "@nestjs/common";
import { Public } from "./common/context.js";
import { APP_CONFIG, type AppConfig } from "./config.js";
import { Database } from "./db/database.js";

/**
 * Thông tin công khai về bản cài đặt: chế độ một/nhiều dòng họ và dòng họ chính (chế độ single).
 * Giao diện dùng để biết cần hiện "Tạo dòng họ" (lần đầu) hay đi thẳng vào dòng họ.
 */
@Controller("instance")
export class InstanceController {
  constructor(
    private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get()
  async get() {
    if (this.config.CLAN_MODE !== "single") return { clanMode: "multi" as const, clan: null };
    const clan = await this.db.app
      .selectFrom("clans")
      .select(["id", "name", "slug", "surname"])
      .where("deleted_at", "is", null)
      .orderBy("created_at")
      .executeTakeFirst();
    return { clanMode: "single" as const, clan: clan ?? null };
  }
}
