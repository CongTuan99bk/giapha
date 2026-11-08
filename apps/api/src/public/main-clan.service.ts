import { Inject, Injectable } from "@nestjs/common";
import { AppError } from "../common/errors.js";
import { GLOBAL_SCOPE, ResponseCache } from "../common/response-cache.js";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { Database } from "../db/database.js";

export interface MainClan {
  id: string;
  name: string;
  surname: string;
  origin_place: string | null;
  root_person_id: string | null;
  day30_rule: "day29" | "nextMonthDay1";
}

/** Dòng họ chính của hệ thống (chế độ một dòng họ): dùng cho trang công khai, thống kê, lời nhắn của khách */
@Injectable()
export class MainClanService {
  constructor(
    private readonly db: Database,
    private readonly cache: ResponseCache,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** null khi chạy nhiều dòng họ hoặc chưa tạo dòng họ nào */
  find(): Promise<MainClan | null> {
    if (this.config.CLAN_MODE !== "single") return Promise.resolve(null);
    return this.cache.memo(
      GLOBAL_SCOPE,
      "main-clan",
      async () =>
        (await this.db.app
          .selectFrom("clans")
          .select(["id", "name", "surname", "origin_place", "root_person_id", "day30_rule"])
          .where("deleted_at", "is", null)
          .orderBy("created_at")
          .executeTakeFirst()) ?? null,
      { ttlMs: 60_000 },
    );
  }

  async get(): Promise<MainClan> {
    const clan = await this.find();
    if (!clan) throw new AppError(404, "NO_PUBLIC_SITE", "Chưa có trang công khai");
    return clan;
  }
}
