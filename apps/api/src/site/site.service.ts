import { Injectable } from "@nestjs/common";
import { sql } from "kysely";
import { idSchema } from "@coinguon/schemas";
import { z } from "zod";
import { audit } from "../common/audit.js";
import type { Membership } from "../common/context.js";
import type { Tx } from "../db/database.js";
import { MEDIA_COLUMNS, MediaService, toMediaDto } from "../media/media.service.js";

/** Phần "trang chủ" trong site_settings.data: banner tự trượt, câu đối hai bên, khẩu hiệu. */
export const homeSettingsSchema = z
  .object({
    banners: z
      .array(z.object({ mediaId: idSchema, caption: z.string().trim().max(120).nullable().optional() }).strict())
      .max(12, { message: "Tối đa 12 ảnh banner" }),
    couplet: z
      .object({ left: z.string().trim().max(40), right: z.string().trim().max(40) })
      .strict()
      .nullable(),
    motto: z.string().trim().max(80).nullable(),
    /** Địa chỉ nhà thờ họ — hiện trên trang chủ kèm nút mở bản đồ */
    templeAddress: z.string().trim().max(200).nullable().optional(),
  })
  .strict();
export type HomeSettings = z.infer<typeof homeSettingsSchema>;

const DEFAULT_HOME: HomeSettings = { banners: [], couplet: null, motto: null, templeAddress: null };

@Injectable()
export class SiteService {
  constructor(private readonly media: MediaService) {}

  private async readData(trx: Tx, clanId: string): Promise<Record<string, unknown>> {
    const row = await trx.selectFrom("site_settings").select("data").where("clan_id", "=", clanId).executeTakeFirst();
    return (row?.data as Record<string, unknown> | undefined) ?? {};
  }

  /** Trang chủ kèm thông tin ảnh; ảnh đã bị xoá tự bị bỏ khỏi danh sách banner. */
  async getHome(trx: Tx, clanId: string) {
    const data = await this.readData(trx, clanId);
    const parsed = homeSettingsSchema.safeParse({ ...DEFAULT_HOME, ...(data.home as object | undefined) });
    const home = parsed.success ? parsed.data : DEFAULT_HOME;
    const ids = home.banners.map((b) => b.mediaId);
    const rows = ids.length
      ? await trx
          .selectFrom("media")
          .select(MEDIA_COLUMNS)
          .where("id", "in", ids)
          .where("deleted_at", "is", null)
          .execute()
      : [];
    const byId = new Map(rows.map((r) => [r.id, toMediaDto(r)]));
    const stats = await trx
      .selectFrom("persons")
      .select((eb) => [eb.fn.countAll<number>().as("people"), eb.fn.max("generation").as("generations")])
      .where("clan_id", "=", clanId)
      .where("deleted_at", "is", null)
      .executeTakeFirstOrThrow();
    return {
      banners: home.banners
        .filter((b) => byId.has(b.mediaId))
        .map((b) => ({ ...byId.get(b.mediaId)!, caption: b.caption ?? byId.get(b.mediaId)!.caption })),
      couplet: home.couplet,
      motto: home.motto,
      templeAddress: home.templeAddress ?? null,
      stats: { people: Number(stats.people), generations: stats.generations ?? 0 },
    };
  }

  async updateHome(trx: Tx, actor: Membership, input: HomeSettings) {
    await this.media.assertExists(trx, input.banners.map((b) => b.mediaId));
    const couplet = input.couplet && (input.couplet.left || input.couplet.right) ? input.couplet : null;
    const home: HomeSettings = { banners: input.banners, couplet, motto: input.motto || null, templeAddress: input.templeAddress || null };
    // Ghi đè riêng khoá "home", giữ nguyên các cài đặt website khác trong data
    await trx
      .insertInto("site_settings")
      .values({ clan_id: actor.clanId, data: JSON.stringify({ home }), updated_at: new Date() })
      .onConflict((oc) =>
        oc.column("clan_id").doUpdateSet({
          data: sql`site_settings.data || jsonb_build_object('home', ${JSON.stringify(home)}::jsonb)`,
          updated_at: new Date(),
        }),
      )
      .execute();
    await audit(trx, { clanId: actor.clanId, actorId: actor.userId, action: "site.home.update", entity: "site_settings", after: home });
    return this.getHome(trx, actor.clanId);
  }
}
