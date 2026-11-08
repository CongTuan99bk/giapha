import { randomUUID } from "node:crypto";
import { contactMessageSchema, idSchema, parseLoginId } from "@coinguon/schemas";
import { Body, Controller, Delete, Get, HttpCode, Inject, Logger, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { audit } from "../common/audit.js";
import { CurrentMembership, type Membership, MinRole, Public } from "../common/context.js";
import { notFound } from "../common/errors.js";
import { RateLimit } from "../common/rate-limit.js";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { Database, type Tx } from "../db/database.js";
import { MailService } from "../mail/mail.service.js";
import { MainClanService } from "../public/main-clan.service.js";

const COLS = ["id", "name", "reply_to", "message", "created_at", "handled_at"] as const;
type Row = { id: string; name: string; reply_to: string; message: string; created_at: Date; handled_at: Date | null };
const toDto = (r: Row) => ({ id: r.id, name: r.name, replyTo: r.reply_to, message: r.message, createdAt: r.created_at, handledAt: r.handled_at });

/** Khách gửi lời nhắn cho ban quản lý từ trang công khai (FR-SITE-08) */
@Public()
@Controller("public/messages")
export class PublicMessagesController {
  private readonly logger = new Logger("LoiNhan");

  constructor(
    private readonly db: Database,
    private readonly clans: MainClanService,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post()
  @HttpCode(204)
  // đủ cho cả nhà thờ họ chung một wifi, nhưng chặn máy gửi hàng loạt
  @RateLimit("contact-message", { limit: 10, windowSec: 3600 })
  async send(@Body() body: unknown): Promise<void> {
    const input = contactMessageSchema.parse(body);
    // ô bẫy: người thật không thấy ô này; có chữ là máy tự điền → bỏ qua nhưng vẫn báo "đã gửi"
    if (input.website?.trim()) return;
    const clan = await this.clans.get();
    const id = parseLoginId(input.replyTo)!;
    const replyTo = id.email ?? id.phone!;
    const admins = await this.db.withClan({ clanId: clan.id, userId: null }, async (trx) => {
      await trx
        .insertInto("contact_messages")
        .values({ id: randomUUID(), clan_id: clan.id, name: input.name, reply_to: replyTo, message: input.message })
        .execute();
      return trx
        .selectFrom("clan_members as m")
        .innerJoin("users as u", "u.id", "m.user_id")
        .select(["u.email"])
        .where("m.role", "in", ["owner", "admin"])
        .where("u.email", "is not", null)
        .where("u.deleted_at", "is", null)
        .execute();
    });
    // báo ban quản lý qua email (nếu có cấu hình gửi thư); không chờ để khách không phải đợi
    const link = this.config.PUBLIC_URL ? `${this.config.PUBLIC_URL.replace(/\/$/, "")}/dong-ho/${clan.id}/cai-dat#loi-nhan` : null;
    for (const a of admins) {
      void this.mail
        .send({
          to: a.email!,
          subject: `Lời nhắn mới từ trang ${clan.name}`,
          text: [
            `${input.name} (${replyTo}) gửi lời nhắn:`,
            "",
            input.message,
            "",
            link ? `Xem và đánh dấu đã xử lý: ${link}` : "Xem trong mục Cài đặt → Lời nhắn của khách.",
          ].join("\n"),
        })
        .catch((err: unknown) => this.logger.error(String(err)));
    }
  }
}

const listQuery = z.object({ status: z.enum(["open", "all"]).default("all") });

/** Ban quản lý đọc và đánh dấu đã xử lý lời nhắn */
@Controller("clans/:clanId/messages")
export class MessagesController {
  constructor(private readonly db: Database) {}

  private async open(trx: Tx) {
    const r = await trx
      .selectFrom("contact_messages")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("handled_at", "is", null)
      .executeTakeFirstOrThrow();
    return Number(r.n);
  }

  @Get()
  @MinRole("admin")
  list(@CurrentMembership() m: Membership, @Query() raw: unknown) {
    const { status } = listQuery.parse(raw);
    return this.db.withClan({ clanId: m.clanId, userId: m.userId }, async (trx) => {
      let q = trx.selectFrom("contact_messages").select(COLS).orderBy("created_at", "desc").limit(200);
      if (status === "open") q = q.where("handled_at", "is", null);
      return { items: (await q.execute()).map(toDto), open: await this.open(trx) };
    });
  }

  @Patch(":messageId")
  @MinRole("admin")
  mark(@CurrentMembership() m: Membership, @Param("messageId") raw: string, @Body() body: unknown) {
    const id = idSchema.parse(raw);
    const { handled } = z.object({ handled: z.boolean() }).strict().parse(body);
    return this.db.withClan({ clanId: m.clanId, userId: m.userId }, async (trx) => {
      const row = await trx
        .updateTable("contact_messages")
        .set({ handled_at: handled ? new Date() : null })
        .where("id", "=", id)
        .returning(COLS)
        .executeTakeFirst();
      if (!row) throw notFound("Không tìm thấy lời nhắn");
      return toDto(row);
    });
  }

  @Delete(":messageId")
  @MinRole("admin")
  @HttpCode(204)
  async remove(@CurrentMembership() m: Membership, @Param("messageId") raw: string): Promise<void> {
    const id = idSchema.parse(raw);
    await this.db.withClan({ clanId: m.clanId, userId: m.userId }, async (trx) => {
      const row = await trx.deleteFrom("contact_messages").where("id", "=", id).returning(["id"]).executeTakeFirst();
      if (!row) throw notFound("Không tìm thấy lời nhắn");
      await audit(trx, { clanId: m.clanId, actorId: m.userId, action: "message.delete", entity: "contact_message", entityId: id });
    });
  }
}
