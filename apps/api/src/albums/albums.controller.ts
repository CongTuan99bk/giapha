import { idSchema } from "@coinguon/schemas";
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { CurrentMembership, type Membership, MinRole } from "../common/context.js";
import { Database } from "../db/database.js";
import { MediaService, toMediaDto } from "../media/media.service.js";
import { albumCreateSchema, AlbumsService, albumUpdateSchema, moveMediaSchema } from "./albums.service.js";

/** Thư viện ảnh của dòng họ: thành viên xem mọi album; biên tập viên trở lên tạo, sửa, xếp ảnh */
@Controller("clans/:clanId")
export class AlbumsController {
  constructor(
    private readonly db: Database,
    private readonly albums: AlbumsService,
    private readonly media: MediaService,
  ) {}

  private ctx(m: Membership) {
    return { clanId: m.clanId, userId: m.userId };
  }

  @Get("albums")
  list(@CurrentMembership() m: Membership) {
    return this.db.withClan(this.ctx(m), (trx) => this.albums.list(trx, { publicOnly: false, toDto: toMediaDto }));
  }

  @Post("albums")
  @MinRole("editor")
  create(@CurrentMembership() m: Membership, @Body() body: unknown) {
    const input = albumCreateSchema.parse(body);
    return this.db.withClan(this.ctx(m), (trx) => this.albums.create(trx, m, input));
  }

  /** Ảnh lẻ: chưa xếp vào album nào (gồm chân dung, banner) — khai báo trước ":albumId" */
  @Get("albums/anh-le")
  loose(@CurrentMembership() m: Membership) {
    return this.db.withClan(this.ctx(m), (trx) => this.albums.detail(trx, null, { publicOnly: false, toDto: toMediaDto }));
  }

  @Get("albums/:albumId")
  detail(@CurrentMembership() m: Membership, @Param("albumId") id: string) {
    return this.db.withClan(this.ctx(m), (trx) => this.albums.detail(trx, idSchema.parse(id), { publicOnly: false, toDto: toMediaDto }));
  }

  @Patch("albums/:albumId")
  @MinRole("editor")
  update(@CurrentMembership() m: Membership, @Param("albumId") id: string, @Body() body: unknown) {
    const input = albumUpdateSchema.parse(body);
    return this.db.withClan(this.ctx(m), (trx) => this.albums.update(trx, m, idSchema.parse(id), input));
  }

  /** `?xoaAnh=1`: xoá luôn các ảnh trong album; mặc định ảnh chuyển về "Ảnh lẻ" */
  @Delete("albums/:albumId")
  @MinRole("editor")
  @HttpCode(204)
  async remove(@CurrentMembership() m: Membership, @Param("albumId") id: string, @Query("xoaAnh") raw?: string) {
    const deletePhotos = z.enum(["0", "1"]).default("0").parse(raw) === "1";
    const keys = await this.db.withClan(this.ctx(m), (trx) => this.albums.remove(trx, m, idSchema.parse(id), deletePhotos));
    // xoá file sau khi đã commit: DB lỗi thì ảnh vẫn còn nguyên
    for (const k of keys) await this.media.purgeFiles(k);
  }

  /** Chuyển nhiều ảnh sang album khác (albumId null = về ảnh lẻ) */
  @Post("media/move")
  @MinRole("editor")
  move(@CurrentMembership() m: Membership, @Body() body: unknown) {
    const input = moveMediaSchema.parse(body);
    return this.db.withClan(this.ctx(m), (trx) => this.albums.move(trx, m, input));
  }
}
