import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { audit } from "../common/audit.js";
import { conflict } from "../common/errors.js";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { Database } from "../db/database.js";

export interface CreateClanInput {
  name: string;
  slug: string;
  surname: string;
  originPlace?: string | undefined;
}

@Injectable()
export class ClansService {
  constructor(
    private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** FR-CLAN-01: tạo dòng họ — người tạo là chủ sở hữu. Chế độ single chỉ cho tạo dòng họ đầu tiên. */
  async create(userId: string, input: CreateClanInput) {
    if (this.config.CLAN_MODE === "single") {
      const existing = await this.db.app.selectFrom("clans").select("id").where("deleted_at", "is", null).executeTakeFirst();
      if (existing) throw conflict("SINGLE_CLAN_EXISTS", "Hệ thống này dành riêng cho một dòng họ và dòng họ đã được tạo");
    }
    const taken = await this.db.app.selectFrom("clans").select("id").where("slug", "=", input.slug).executeTakeFirst();
    if (taken) throw conflict("SLUG_TAKEN", "Tên miền con này đã có dòng họ dùng");

    const clanId = randomUUID();
    await this.db.app
      .insertInto("clans")
      .values({
        id: clanId,
        name: input.name,
        slug: input.slug,
        surname: input.surname,
        origin_place: input.originPlace ?? null,
        updated_at: new Date(),
      })
      .execute();
    await this.db.withClan({ clanId, userId }, async (trx) => {
      await trx.insertInto("clan_members").values({ id: randomUUID(), clan_id: clanId, user_id: userId, role: "owner" }).execute();
      await trx.insertInto("site_settings").values({ clan_id: clanId, data: "{}", updated_at: new Date() }).execute();
      await audit(trx, { clanId, actorId: userId, action: "clan.create", entity: "clan", entityId: clanId, after: input });
    });
    return { id: clanId, ...input, role: "owner" as const };
  }
}
