import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { sql } from "kysely";
import { z } from "zod";
import { audit } from "../common/audit.js";
import type { Membership } from "../common/context.js";
import { notFound, unprocessable } from "../common/errors.js";
import type { Tx } from "../db/database.js";
import { MEDIA_COLUMNS, MediaService, type MediaRow } from "../media/media.service.js";

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional());

export const albumCreateSchema = z
  .object({
    title: z.string().trim().min(1, { message: "Cần đặt tên album" }).max(120, { message: "Tên album tối đa 120 ký tự" }),
    description: optionalText(2000),
    /** public: khách xem được trên trang công khai; members: chỉ con cháu đã đăng nhập */
    visibility: z.enum(["public", "members"]).default("members"),
  })
  .strict();

export const albumUpdateSchema = z
  .object({
    title: albumCreateSchema.shape.title.optional(),
    description: optionalText(2000),
    visibility: z.enum(["public", "members"]).optional(),
    /** Ảnh bìa: một ảnh trong album; null = tự lấy ảnh đầu tiên */
    coverId: z.uuid().nullable().optional(),
  })
  .strict();

export const moveMediaSchema = z
  .object({
    mediaIds: z.array(z.uuid()).min(1).max(500),
    /** null = bỏ khỏi album (về "Ảnh lẻ") */
    albumId: z.uuid().nullable(),
  })
  .strict();

interface AlbumRow {
  id: string;
  title: string;
  description: string | null;
  visibility: "public" | "members";
  cover_id: string | null;
  created_at: Date;
}

/** Ảnh hiển thị ra ngoài: người gọi chọn cách dựng (thành viên: đủ cỡ + ảnh gốc; khách: chỉ cỡ xem) */
export type ToDto = (m: MediaRow) => object;

const ALBUM_COLS = ["id", "title", "description", "visibility", "cover_id", "created_at"] as const;

/** Thư viện ảnh theo album (FR-MEDIA-03). Ảnh không thuộc album nào là "ảnh lẻ" (chân dung, banner, ảnh chưa xếp). */
@Injectable()
export class AlbumsService {
  constructor(private readonly media: MediaService) {}

  /**
   * Danh sách album kèm số ảnh, ảnh bìa (ảnh được chọn, hoặc ảnh đầu tiên), lần thêm ảnh gần nhất.
   * `publicOnly`: chỉ album công khai có ít nhất một ảnh (cho khách).
   */
  async list(trx: Tx, opts: { publicOnly: boolean; toDto: ToDto }) {
    let q = trx.selectFrom("albums").select(ALBUM_COLS).where("deleted_at", "is", null);
    if (opts.publicOnly) q = q.where("visibility", "=", "public");
    const albums = await q.execute();
    const stats = await trx
      .selectFrom("media")
      .select((eb) => ["album_id", eb.fn.countAll<string>().as("n"), eb.fn.max("created_at").as("last")])
      .where("deleted_at", "is", null)
      .groupBy("album_id")
      .execute();
    const statOf = new Map(stats.map((s) => [s.album_id, { count: Number(s.n), last: s.last as Date | null }]));
    const covers = await this.covers(
      trx,
      albums.map((a) => a.id),
    );
    const items = albums
      .map((a) => {
        const st = statOf.get(a.id) ?? { count: 0, last: null };
        const cover = (a.cover_id && covers.chosen.get(a.cover_id)?.album_id === a.id ? covers.chosen.get(a.cover_id) : covers.first.get(a.id)) ?? null;
        return {
          ...this.albumDto(a),
          count: st.count,
          cover: cover ? opts.toDto(cover) : null,
          lastAddedAt: st.last,
        };
      })
      .filter((a) => !opts.publicOnly || a.count > 0)
      // album có ảnh mới thêm lên trước; album trống xếp theo ngày tạo
      .sort((a, b) => +(b.lastAddedAt ?? b.createdAt) - +(a.lastAddedAt ?? a.createdAt));
    if (opts.publicOnly) return { albums: items };
    const loose = statOf.get(null) ?? { count: 0, last: null };
    return { albums: items, loose: { count: loose.count } };
  }

  /** Ảnh bìa: ảnh được chọn (nếu còn) và ảnh đầu tiên của mỗi album */
  private async covers(trx: Tx, albumIds: string[]) {
    if (albumIds.length === 0) return { chosen: new Map<string, MediaRow>(), first: new Map<string, MediaRow>() };
    const chosenIds = (await trx.selectFrom("albums").select("cover_id").where("id", "in", albumIds).where("cover_id", "is not", null).execute()).map(
      (r) => r.cover_id!,
    );
    const chosen = new Map((await this.media.getMany(trx, chosenIds)).map((m) => [m.id, m]));
    const firstRows = await trx
      .selectFrom("media")
      .select(MEDIA_COLUMNS)
      .distinctOn("album_id")
      .where("album_id", "in", albumIds)
      .where("deleted_at", "is", null)
      .orderBy("album_id")
      .orderBy("created_at")
      .execute();
    return { chosen, first: new Map(firstRows.map((m) => [m.album_id!, m])) };
  }

  private albumDto(a: AlbumRow) {
    return { id: a.id, title: a.title, description: a.description, visibility: a.visibility, coverId: a.cover_id, createdAt: a.created_at };
  }

  async get(trx: Tx, id: string, opts: { publicOnly: boolean } = { publicOnly: false }): Promise<AlbumRow> {
    let q = trx.selectFrom("albums").select(ALBUM_COLS).where("id", "=", id).where("deleted_at", "is", null);
    if (opts.publicOnly) q = q.where("visibility", "=", "public");
    const row = await q.executeTakeFirst();
    if (!row) throw notFound("Không tìm thấy album");
    return row;
  }

  /** Một album và toàn bộ ảnh (cũ trước, mới sau — đúng thứ tự diễn ra sự kiện). `id = null`: ảnh lẻ */
  async detail(trx: Tx, id: string | null, opts: { publicOnly: boolean; toDto: ToDto }) {
    const album = id ? await this.get(trx, id, opts) : null;
    let q = trx.selectFrom("media").select(MEDIA_COLUMNS).where("deleted_at", "is", null).orderBy("created_at").orderBy("id").limit(2000);
    q = id ? q.where("album_id", "=", id) : q.where("album_id", "is", null);
    const photos = (await q.execute()).map(opts.toDto);
    return { album: album ? this.albumDto(album) : null, photos };
  }

  async create(trx: Tx, actor: Membership, input: z.infer<typeof albumCreateSchema>) {
    const id = randomUUID();
    const row = await trx
      .insertInto("albums")
      .values({ id, clan_id: actor.clanId, title: input.title, description: input.description ?? null, visibility: input.visibility })
      .returning(ALBUM_COLS)
      .executeTakeFirstOrThrow();
    await audit(trx, { clanId: actor.clanId, actorId: actor.userId, action: "album.create", entity: "album", entityId: id, after: input });
    return { ...this.albumDto(row), count: 0, cover: null, lastAddedAt: null };
  }

  async update(trx: Tx, actor: Membership, id: string, input: z.infer<typeof albumUpdateSchema>) {
    await this.get(trx, id);
    if (input.coverId) {
      const m = await this.media.get(trx, input.coverId);
      if (m.album_id !== id) throw unprocessable("COVER_NOT_IN_ALBUM", "Ảnh bìa phải là ảnh trong album này", [{ path: "coverId", message: "Ảnh không thuộc album" }]);
    }
    const set = {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.visibility !== undefined && { visibility: input.visibility }),
      ...(input.coverId !== undefined && { cover_id: input.coverId }),
    };
    const row = Object.keys(set).length
      ? await trx.updateTable("albums").set(set).where("id", "=", id).returning(ALBUM_COLS).executeTakeFirstOrThrow()
      : await this.get(trx, id);
    await audit(trx, { clanId: actor.clanId, actorId: actor.userId, action: "album.update", entity: "album", entityId: id, after: input });
    return this.albumDto(row);
  }

  /**
   * Xoá album. Mặc định giữ ảnh (chuyển về "Ảnh lẻ"); `deletePhotos` thì xoá luôn ảnh —
   * trả về khoá lưu trữ để người gọi xoá file SAU KHI transaction đã commit.
   */
  async remove(trx: Tx, actor: Membership, id: string, deletePhotos: boolean): Promise<string[]> {
    await this.get(trx, id);
    const keys: string[] = [];
    if (deletePhotos) {
      const photos = await trx.selectFrom("media").select("id").where("album_id", "=", id).where("deleted_at", "is", null).execute();
      for (const p of photos) keys.push(await this.media.remove(trx, actor, p.id));
    }
    await trx.updateTable("media").set({ album_id: null }).where("album_id", "=", id).execute();
    await trx.updateTable("albums").set({ deleted_at: new Date(), cover_id: null }).where("id", "=", id).execute();
    await audit(trx, { clanId: actor.clanId, actorId: actor.userId, action: "album.delete", entity: "album", entityId: id, after: { deletePhotos } });
    return keys;
  }

  /** Chuyển nhiều ảnh vào một album (hoặc về ảnh lẻ) */
  async move(trx: Tx, actor: Membership, input: z.infer<typeof moveMediaSchema>) {
    if (input.albumId) await this.get(trx, input.albumId);
    await this.media.assertExists(trx, input.mediaIds);
    const moved = await trx
      .updateTable("media")
      .set({ album_id: input.albumId })
      .where("id", "in", input.mediaIds)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    // ảnh bìa bị chuyển đi → album đó tự lấy ảnh đầu tiên
    await trx
      .updateTable("albums")
      .set({ cover_id: null })
      .where("cover_id", "in", input.mediaIds)
      .where((eb) => (input.albumId ? eb("id", "<>", input.albumId) : sql<boolean>`true`))
      .execute();
    await audit(trx, { clanId: actor.clanId, actorId: actor.userId, action: "media.move", entity: "album", entityId: input.albumId ?? actor.clanId, after: input });
    return { moved: Number(moved.numUpdatedRows) };
  }
}
