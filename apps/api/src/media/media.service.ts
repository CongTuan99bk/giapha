import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import sharp, { type Metadata } from "sharp";
import { audit } from "../common/audit.js";
import type { Membership } from "../common/context.js";
import { notFound, unprocessable } from "../common/errors.js";
import type { Tx } from "../db/database.js";
import { MediaStorage } from "./media-storage.js";

/** Các cỡ ảnh tạo sẵn. `orig` giữ đủ phân giải để lưu trữ tư liệu (đã bỏ EXIF/GPS). */
export const VARIANTS = ["sm", "md", "lg", "orig"] as const;
export type Variant = (typeof VARIANTS)[number];

// HEIC (iPhone) không có trong bản sharp dựng sẵn (bản quyền HEVC); "heif" ở đây chỉ là AVIF
const ACCEPTED = new Set(["jpeg", "png", "webp", "heif", "tiff", "gif"]);
const MAX_PIXELS = 80_000_000; // chặn "bom giải nén" (ảnh khai báo kích thước khổng lồ)

export interface ProcessedImage {
  width: number;
  height: number;
  origMime: string;
  origExt: string;
  files: Record<Variant, Buffer>;
}

/**
 * Xử lý ảnh tải lên:
 * - xoay theo hướng chụp rồi BỎ toàn bộ metadata (EXIF, toạ độ GPS nơi chụp, tên máy) — bảo vệ riêng tư;
 * - tạo cỡ nhỏ (vuông 320, dùng cho ảnh chân dung/ô phả đồ), vừa (960), lớn (1920) dạng WebP;
 * - bản gốc giữ phân giải, nén lại chất lượng cao (JPEG/PNG).
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw unprocessable("UNSUPPORTED_IMAGE", "Không đọc được file này. Hãy chọn ảnh JPG, PNG hoặc WebP.");
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) {
    throw unprocessable("UNSUPPORTED_IMAGE", "Không đọc được file này. Hãy chọn ảnh JPG, PNG hoặc WebP.");
  }
  const base = () => sharp(input, { limitInputPixels: MAX_PIXELS, animated: false }).rotate(); // rotate() theo EXIF, rồi metadata bị bỏ khi xuất
  const keepPng = meta.format === "png" || (meta.format === "webp" && meta.hasAlpha);

  const [orig, lg, md, sm] = await Promise.all([
    keepPng ? base().png({ compressionLevel: 9 }).toBuffer() : base().jpeg({ quality: 92, mozjpeg: true }).toBuffer(),
    base().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
    base().resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    base().resize({ width: 320, height: 320, fit: "cover", position: sharp.strategy.attention }).webp({ quality: 78 }).toBuffer(),
  ]);
  const size = await sharp(orig).metadata();
  return {
    width: size.width ?? 0,
    height: size.height ?? 0,
    origMime: keepPng ? "image/png" : "image/jpeg",
    origExt: keepPng ? "png" : "jpg",
    files: { orig, lg, md, sm },
  };
}

export const fileNameOf = (variant: Variant, origExt: string) => (variant === "orig" ? `orig.${origExt}` : `${variant}.webp`);
const extOfMime = (mime: string) => (mime === "image/png" ? "png" : "jpg");

export interface MediaRow {
  id: string;
  clan_id: string;
  storage_key: string;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  caption: string | null;
  created_at: Date;
}

export function toMediaDto(m: MediaRow) {
  const base = `/api/v1/clans/${m.clan_id}/media/${m.id}`;
  return {
    id: m.id,
    width: m.width,
    height: m.height,
    caption: m.caption,
    sizeBytes: m.size_bytes,
    createdAt: m.created_at,
    urls: { sm: `${base}/sm`, md: `${base}/md`, lg: `${base}/lg`, orig: `${base}/orig` },
  };
}

const COLUMNS = ["id", "clan_id", "storage_key", "mime", "size_bytes", "width", "height", "caption", "created_at"] as const;

@Injectable()
export class MediaService {
  constructor(private readonly storage: MediaStorage) {}

  /** Ghi file trước, rồi mới ghi DB; DB lỗi thì dọn file để không để rác. */
  async upload(trx: Tx, actor: Membership, file: Buffer, caption: string | null) {
    const img = await processImage(file);
    const id = randomUUID();
    const key = `${actor.clanId}/${id}`;
    await Promise.all(VARIANTS.map((v) => this.storage.put(`${key}/${fileNameOf(v, img.origExt)}`, img.files[v])));
    try {
      const row = await trx
        .insertInto("media")
        .values({
          id,
          clan_id: actor.clanId,
          storage_key: key,
          mime: img.origMime,
          size_bytes: VARIANTS.reduce((s, v) => s + img.files[v].length, 0),
          width: img.width,
          height: img.height,
          caption,
          uploaded_by: actor.userId,
        })
        .returning(COLUMNS)
        .executeTakeFirstOrThrow();
      await audit(trx, { clanId: actor.clanId, actorId: actor.userId, action: "media.upload", entity: "media", entityId: id });
      return toMediaDto(row);
    } catch (err) {
      await this.storage.removeDir(key);
      throw err;
    }
  }

  async get(trx: Tx, id: string): Promise<MediaRow> {
    const row = await trx.selectFrom("media").select(COLUMNS).where("id", "=", id).where("deleted_at", "is", null).executeTakeFirst();
    if (!row) throw notFound("Không tìm thấy ảnh");
    return row;
  }

  /** Nhiều ảnh một lần (bỏ qua ảnh đã xoá) */
  async getMany(trx: Tx, ids: string[]): Promise<MediaRow[]> {
    if (ids.length === 0) return [];
    return trx.selectFrom("media").select(COLUMNS).where("id", "in", ids).where("deleted_at", "is", null).execute();
  }

  /** Đường dẫn file trên đĩa của một cỡ ảnh (sau khi đã kiểm tra quyền qua RLS ở `get`). */
  filePath(row: MediaRow, variant: Variant): string {
    return this.storage.pathOf(`${row.storage_key}/${fileNameOf(variant, extOfMime(row.mime))}`);
  }

  async list(trx: Tx, limit: number) {
    const rows = await trx.selectFrom("media").select(COLUMNS).where("deleted_at", "is", null).orderBy("created_at", "desc").limit(limit).execute();
    return rows.map(toMediaDto);
  }

  async updateCaption(trx: Tx, actor: Membership, id: string, caption: string | null) {
    await this.get(trx, id);
    const row = await trx.updateTable("media").set({ caption }).where("id", "=", id).returning(COLUMNS).executeTakeFirstOrThrow();
    await audit(trx, { clanId: actor.clanId, actorId: actor.userId, action: "media.update", entity: "media", entityId: id, after: { caption } });
    return toMediaDto(row);
  }

  /**
   * Xoá ảnh trong DB (gỡ khỏi ảnh chân dung; banner tự bỏ qua ảnh đã xoá). Trả về khoá lưu trữ —
   * người gọi xoá file bằng `purgeFiles` SAU KHI transaction đã commit, để DB lỗi thì file vẫn còn.
   */
  async remove(trx: Tx, actor: Membership, id: string): Promise<string> {
    const row = await this.get(trx, id);
    await trx.updateTable("persons").set({ avatar_media_id: null }).where("avatar_media_id", "=", id).execute();
    await trx.updateTable("media").set({ deleted_at: new Date() }).where("id", "=", id).execute();
    await audit(trx, { clanId: actor.clanId, actorId: actor.userId, action: "media.delete", entity: "media", entityId: id });
    return row.storage_key;
  }

  purgeFiles(storageKey: string): Promise<void> {
    return this.storage.removeDir(storageKey);
  }

  /** Kiểm tra ảnh thuộc dòng họ hiện tại (RLS) và còn tồn tại */
  async assertExists(trx: Tx, ids: string[]) {
    if (ids.length === 0) return;
    const found = await trx.selectFrom("media").select("id").where("id", "in", ids).where("deleted_at", "is", null).execute();
    if (found.length !== new Set(ids).size) throw unprocessable("MEDIA_NOT_FOUND", "Có ảnh không tồn tại hoặc đã bị xoá");
  }
}

