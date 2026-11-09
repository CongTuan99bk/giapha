/// <reference types="multer" />
import { idSchema } from "@coinguon/schemas";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { z } from "zod";
import { CurrentMembership, type Membership, MinRole } from "../common/context.js";
import { unprocessable } from "../common/errors.js";
import { RateLimit } from "../common/rate-limit.js";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { Database } from "../db/database.js";
import { AlbumsService } from "../albums/albums.service.js";
import { homeSettingsSchema, SiteService } from "../site/site.service.js";
import { MediaService, VARIANTS, type Variant } from "./media.service.js";

const HARD_LIMIT = 50 * 1024 * 1024; // chặn ở tầng đọc request; giới hạn thật lấy từ MEDIA_MAX_MB
const captionSchema = z.string().trim().max(300).nullable();

@Controller("clans/:clanId")
export class MediaController {
  constructor(
    private readonly db: Database,
    private readonly media: MediaService,
    private readonly site: SiteService,
    private readonly albums: AlbumsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private ctx(m: Membership) {
    return { clanId: m.clanId, userId: m.userId };
  }

  /** Tải ảnh lên (multipart, trường "file"; tuỳ chọn "caption") */
  @Post("media")
  @MinRole("editor")
  @RateLimit("upload", { limit: 120, windowSec: 600 })
  // không khai báo storage → multer giữ file trong bộ nhớ (memoryStorage), xử lý xong mới ghi đĩa
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: HARD_LIMIT, files: 1 } }))
  async upload(@CurrentMembership() m: Membership, @UploadedFile() file: Express.Multer.File | undefined, @Body() body: Record<string, unknown>) {
    if (!file) throw unprocessable("FILE_REQUIRED", "Chưa chọn ảnh");
    if (file.size > this.config.MEDIA_MAX_MB * 1024 * 1024) throw new PayloadTooLargeException();
    const caption = captionSchema.parse(typeof body.caption === "string" && body.caption.trim() ? body.caption : null);
    // tải thẳng vào một album (trường "albumId" trong form)
    const albumId = typeof body.albumId === "string" && body.albumId ? idSchema.parse(body.albumId) : null;
    return this.db.withClan(this.ctx(m), async (trx) => {
      if (albumId) await this.albums.get(trx, albumId);
      return this.media.upload(trx, m, file.buffer, caption, albumId);
    });
  }

  @Get("media")
  list(@CurrentMembership() m: Membership, @Query("limit") limit?: string) {
    const n = z.coerce.number().int().min(1).max(200).default(60).parse(limit);
    return this.db.withClan(this.ctx(m), (trx) => this.media.list(trx, n));
  }

  /**
   * Tải file ảnh. Kiểm tra quyền qua RLS (phải là thành viên dòng họ). Nội dung một cỡ ảnh không bao giờ đổi
   * (đổi ảnh = ảnh mới, mã mới) nên cho trình duyệt lưu cache lâu, nhưng "private" để proxy không lưu chung.
   */
  @Get("media/:mediaId/:variant")
  async file(@CurrentMembership() m: Membership, @Param("mediaId") id: string, @Param("variant") variant: string, @Res() res: Response) {
    const v = z.enum(VARIANTS).parse(variant) as Variant;
    const row = await this.db.withClan(this.ctx(m), (trx) => this.media.get(trx, idSchema.parse(id)));
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(v === "orig" ? row.mime : "image/webp");
    if (v === "orig") res.attachment(`anh-${row.id.slice(0, 8)}.${row.mime === "image/png" ? "png" : "jpg"}`);
    res.sendFile(this.media.filePath(row, v), { dotfiles: "deny" }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ code: "NOT_FOUND", message: "Không tìm thấy file ảnh" });
    });
  }

  @Patch("media/:mediaId")
  @MinRole("editor")
  updateCaption(@CurrentMembership() m: Membership, @Param("mediaId") id: string, @Body() body: unknown) {
    const { caption } = z.object({ caption: captionSchema }).strict().parse(body);
    return this.db.withClan(this.ctx(m), (trx) => this.media.updateCaption(trx, m, idSchema.parse(id), caption || null));
  }

  @Delete("media/:mediaId")
  @MinRole("editor")
  @HttpCode(204)
  async remove(@CurrentMembership() m: Membership, @Param("mediaId") id: string) {
    const key = await this.db.withClan(this.ctx(m), (trx) => this.media.remove(trx, m, idSchema.parse(id)));
    await this.media.purgeFiles(key);
  }

  // ───────────── Trang chủ: banner, câu đối ─────────────

  @Get("site/home")
  home(@CurrentMembership() m: Membership) {
    return this.db.withClan(this.ctx(m), (trx) => this.site.getHome(trx, m.clanId));
  }

  @Put("site/home")
  @MinRole("admin")
  updateHome(@CurrentMembership() m: Membership, @Body() body: unknown) {
    const input = homeSettingsSchema.parse(body);
    return this.db.withClan(this.ctx(m), (trx) => this.site.updateHome(trx, m, input));
  }
}
