/// <reference types="multer" />
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { Body, Controller, Delete, Get, HttpCode, Patch, Put, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { sql } from "kysely";
import { z } from "zod";
import { audit } from "../common/audit.js";
import { CurrentMembership, type Membership, MinRole, Public } from "../common/context.js";
import { notFound, unprocessable } from "../common/errors.js";
import { RateLimit } from "../common/rate-limit.js";
import { Database, type Tx } from "../db/database.js";
import { MediaStorage } from "../media/media-storage.js";
import { MainClanService } from "../public/main-clan.service.js";

const MAX_BYTES = 20 * 1024 * 1024;
const titleSchema = z.string().trim().min(1, { message: "Đặt tên cho bản nhạc" }).max(120, { message: "Tên tối đa 120 ký tự" });

/** Thông tin nhạc nền lưu trong site_settings.data.music */
interface StoredMusic {
  key: string;
  mime: string;
  title: string;
  sizeBytes: number;
  updatedAt: string;
}

/** Nhận dạng file âm thanh bằng nội dung đầu file (không tin đuôi tên file / Content-Type trình duyệt gửi) */
export function sniffAudio(b: Buffer): { mime: string; ext: string } | null {
  if (b.length < 12) return null;
  const ascii = (from: number, to: number) => b.subarray(from, to).toString("latin1");
  if (ascii(0, 3) === "ID3" || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0)) return { mime: "audio/mpeg", ext: "mp3" };
  if (ascii(4, 8) === "ftyp") return { mime: "audio/mp4", ext: "m4a" };
  if (ascii(0, 4) === "OggS") return { mime: "audio/ogg", ext: "ogg" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return { mime: "audio/wav", ext: "wav" };
  return null;
}

async function readMusic(trx: Tx, clanId: string): Promise<StoredMusic | null> {
  const row = await trx.selectFrom("site_settings").select("data").where("clan_id", "=", clanId).executeTakeFirst();
  const m = (row?.data as { music?: StoredMusic } | undefined)?.music;
  return m?.key ? m : null;
}

async function writeMusic(trx: Tx, clanId: string, music: StoredMusic | null) {
  await trx
    .insertInto("site_settings")
    .values({ clan_id: clanId, data: JSON.stringify(music ? { music } : {}), updated_at: new Date() })
    .onConflict((oc) =>
      oc.column("clan_id").doUpdateSet({
        data: music ? sql`site_settings.data || jsonb_build_object('music', ${JSON.stringify(music)}::jsonb)` : sql`site_settings.data - 'music'`,
        updated_at: new Date(),
      }),
    )
    .execute();
}

/** Thông tin gửi trình duyệt; `?v=` đổi khi thay bài để trình duyệt không phát bản cũ đã lưu */
const dto = (m: StoredMusic, fileUrl: string) => ({
  title: m.title,
  mime: m.mime,
  sizeBytes: m.sizeBytes,
  updatedAt: m.updatedAt,
  url: `${fileUrl}?v=${new Date(m.updatedAt).getTime()}`,
});

function sendAudio(res: Response, storage: MediaStorage, m: StoredMusic) {
  // sendFile hỗ trợ tải từng đoạn (Range) để tua và phát ngay khi chưa tải hết
  res.sendFile(storage.pathOf(m.key), { headers: { "Cache-Control": "public, max-age=31536000, immutable", "Content-Type": m.mime } }, (err) => {
    // file bị mất trên đĩa (khôi phục sao lưu thiếu thư mục nhạc…): báo 404 thay vì treo kết nối
    if (err && !res.headersSent) res.status(404).json({ code: "NOT_FOUND", message: "Không tìm thấy file nhạc" });
  });
}

/** Nhạc nền của dòng họ (thành viên nghe, quản trị thay bài) */
@Controller("clans/:clanId/site/music")
export class MusicController {
  constructor(
    private readonly db: Database,
    private readonly storage: MediaStorage,
  ) {}

  private ctx(m: Membership) {
    return { clanId: m.clanId, userId: m.userId };
  }

  @Get()
  async get(@CurrentMembership() m: Membership) {
    const music = await this.db.withClan(this.ctx(m), (trx) => readMusic(trx, m.clanId));
    return { music: music ? dto(music, `/api/v1/clans/${m.clanId}/site/music/file`) : null };
  }

  @Get("file")
  async file(@CurrentMembership() m: Membership, @Res() res: Response) {
    const music = await this.db.withClan(this.ctx(m), (trx) => readMusic(trx, m.clanId));
    if (!music) throw notFound("Chưa có nhạc nền");
    sendAudio(res, this.storage, music);
  }

  /** Thay bài: trường "file" (MP3, M4A, OGG, WAV ≤ 20 MB) và "title" */
  @Put()
  @MinRole("admin")
  @RateLimit("music-upload", { limit: 20, windowSec: 3600 })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_BYTES, files: 1 } }))
  async upload(@CurrentMembership() m: Membership, @UploadedFile() file: Express.Multer.File | undefined, @Body() body: Record<string, unknown>) {
    if (!file) throw unprocessable("FILE_REQUIRED", "Chưa chọn file nhạc", [{ path: "file", message: "Chưa chọn file nhạc" }]);
    const kind = sniffAudio(file.buffer);
    if (!kind) {
      throw unprocessable("NOT_AUDIO", "File không phải nhạc MP3, M4A, OGG hoặc WAV", [{ path: "file", message: "Chỉ nhận nhạc MP3, M4A, OGG hoặc WAV" }]);
    }
    const original = Buffer.from(file.originalname, "latin1")
      .toString("utf8")
      .replace(/\.[^.]+$/, "");
    const title = titleSchema.parse(typeof body.title === "string" && body.title.trim() ? body.title : original || "Nhạc nền");
    const music: StoredMusic = {
      key: `nhac/${m.clanId}/${randomUUID()}.${kind.ext}`,
      mime: kind.mime,
      title,
      sizeBytes: file.size,
      updatedAt: new Date().toISOString(),
    };
    await this.storage.put(music.key, file.buffer);
    let old: StoredMusic | null = null;
    try {
      old = await this.db.withClan(this.ctx(m), async (trx) => {
        const before = await readMusic(trx, m.clanId);
        await writeMusic(trx, m.clanId, music);
        await audit(trx, { clanId: m.clanId, actorId: m.userId, action: "site.music.set", entity: "site_settings", after: { title, sizeBytes: file.size } });
        return before;
      });
    } catch (err) {
      await rm(this.storage.pathOf(music.key), { force: true });
      throw err;
    }
    // bài cũ xoá sau khi đã ghi xong bài mới
    if (old) await rm(this.storage.pathOf(old.key), { force: true });
    return { music: dto(music, `/api/v1/clans/${m.clanId}/site/music/file`) };
  }

  @Patch()
  @MinRole("admin")
  async rename(@CurrentMembership() m: Membership, @Body() body: unknown) {
    const { title } = z.object({ title: titleSchema }).strict().parse(body);
    return this.db.withClan(this.ctx(m), async (trx) => {
      const music = await readMusic(trx, m.clanId);
      if (!music) throw notFound("Chưa có nhạc nền");
      const next = { ...music, title };
      await writeMusic(trx, m.clanId, next);
      return { music: dto(next, `/api/v1/clans/${m.clanId}/site/music/file`) };
    });
  }

  @Delete()
  @MinRole("admin")
  @HttpCode(204)
  async remove(@CurrentMembership() m: Membership) {
    const old = await this.db.withClan(this.ctx(m), async (trx) => {
      const before = await readMusic(trx, m.clanId);
      await writeMusic(trx, m.clanId, null);
      await audit(trx, { clanId: m.clanId, actorId: m.userId, action: "site.music.remove", entity: "site_settings" });
      return before;
    });
    if (old) await rm(this.storage.pathOf(old.key), { force: true });
  }
}

/** Nhạc nền trên trang công khai (khách tự bật, mặc định tắt) */
@Public()
@RateLimit("public", { limit: 3000, windowSec: 300 })
@Controller("public/music")
export class PublicMusicController {
  constructor(
    private readonly db: Database,
    private readonly storage: MediaStorage,
    private readonly clans: MainClanService,
  ) {}

  private async music() {
    const clan = await this.clans.find();
    if (!clan) return null;
    return this.db.withClan({ clanId: clan.id, userId: null }, (trx) => readMusic(trx, clan.id));
  }

  @Get()
  async get() {
    const music = await this.music();
    return { music: music ? dto(music, "/api/v1/public/music/file") : null };
  }

  @Get("file")
  async file(@Res() res: Response) {
    const music = await this.music();
    if (!music) throw notFound("Chưa có nhạc nền");
    sendAudio(res, this.storage, music);
  }
}
