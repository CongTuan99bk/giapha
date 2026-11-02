import { Controller, Get, Header, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { CurrentMembership, type Membership, ROLE_RANK } from "../common/context.js";
import { Database, type Tx } from "../db/database.js";
import {
  type AnniversarySource,
  deathLunarYearOf,
  isoDate,
  parseIsoDate,
  todayInVietnam,
  toIcs,
  upcomingAnniversaries,
} from "./upcoming.js";

const query = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Ngày dạng YYYY-MM-DD" })
    .optional(),
  days: z.coerce.number().int().min(1).max(800).default(365),
});

const icsQuery = z.object({ years: z.coerce.number().int().min(1).max(5).default(2) });

/**
 * Người đã mất có ngày giỗ, theo quyền xem:
 * - "admin": cả người ẩn thông tin; "member": trừ người ẩn;
 * - "public" (website công khai): chỉ người để chế độ "Mọi người".
 */
export async function loadAnniversarySources(trx: Tx, clanId: string, mode: "admin" | "member" | "public") {
  const clan = await trx.selectFrom("clans").select(["name", "slug", "day30_rule"]).where("id", "=", clanId).executeTakeFirstOrThrow();
  let q = trx
    .selectFrom("persons")
    .select(["id", "full_name", "gender", "generation", "in_clan", "death_date", "death_anniv_lunar"])
    .where("deleted_at", "is", null)
    .where("is_living", "=", false);
  if (mode === "member") q = q.where("privacy", "<>", "hidden");
  if (mode === "public") q = q.where("privacy", "=", "public");
  const rows = await q.execute();

  const sources: AnniversarySource[] = [];
  let missing = 0;
  for (const r of rows) {
    const a = r.death_anniv_lunar as { day?: number; month?: number; isLeapMonth?: boolean } | null;
    if (!a?.day || !a.month) {
      if (r.in_clan) missing++;
      continue;
    }
    const death = r.death_date as { year?: number } | null;
    sources.push({
      id: r.id,
      fullName: r.full_name,
      gender: r.gender,
      generation: r.generation,
      inClan: r.in_clan,
      anniv: { day: a.day, month: a.month, isLeapMonth: Boolean(a.isLeapMonth) },
      deathLunarYear: deathLunarYearOf(r.death_date),
      deathYear: typeof death?.year === "number" ? death.year : null,
    });
  }
  return { clan, sources, missing };
}

/** Lịch giỗ (FR-EVENT-01): tính từ ngày mất âm lịch của từng người, không cần nhập riêng. */
@Controller("clans/:clanId")
export class AnniversariesController {
  constructor(private readonly db: Database) {}

  private load(m: Membership) {
    // Người "ẩn thông tin" chỉ quản trị thấy (giống phả đồ)
    const mode = ROLE_RANK[m.role] >= ROLE_RANK.admin ? "admin" : "member";
    return this.db.withClan({ clanId: m.clanId, userId: m.userId }, (trx) => loadAnniversarySources(trx, m.clanId, mode));
  }

  /** Các ngày giỗ trong `days` ngày kể từ `from` (mặc định hôm nay theo giờ Việt Nam) */
  @Get("anniversaries")
  async list(@CurrentMembership() m: Membership, @Query() raw: unknown) {
    const q = query.parse(raw);
    const from = q.from ? parseIsoDate(q.from) : todayInVietnam();
    const { clan, sources, missing } = await this.load(m);
    const items = upcomingAnniversaries(sources, { from, days: q.days, day30Rule: clan.day30_rule });
    return {
      from: isoDate(from),
      days: q.days,
      items,
      /** Người trong họ đã mất nhưng chưa có ngày mất đủ ngày/tháng → chưa tính được giỗ */
      missingDeathDay: missing,
    };
  }

  /** Tải lịch giỗ dạng .ics để thêm vào lịch điện thoại (Google Calendar, lịch iPhone) */
  @Get("anniversaries.ics")
  @Header("Content-Type", "text/calendar; charset=utf-8")
  @Header("Cache-Control", "private, no-store")
  async ics(@CurrentMembership() m: Membership, @Query() raw: unknown, @Res({ passthrough: true }) res: Response) {
    const { years } = icsQuery.parse(raw);
    const { clan, sources } = await this.load(m);
    const items = upcomingAnniversaries(sources, { from: todayInVietnam(), days: years * 366, day30Rule: clan.day30_rule });
    // Tên file chỉ dùng chữ không dấu (slug): Chrome bỏ qua cả tên khi gặp filename* có dấu ở một số bản
    res.setHeader("Content-Disposition", `attachment; filename="lich-gio-${clan.slug}.ics"`);
    return toIcs(items, clan.name);
  }
}
