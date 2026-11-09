/// <reference types="multer" />
import { readFile } from "node:fs/promises";
import { idSchema } from "@coinguon/schemas";
import { Controller, Get, HttpCode, Param, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import sharp from "sharp";
import { z } from "zod";
import { CurrentMembership, type Membership, MinRole, ROLE_RANK } from "../common/context.js";
import { unprocessable } from "../common/errors.js";
import { RateLimit } from "../common/rate-limit.js";
import { Database } from "../db/database.js";
import { buildScene, describePdf, PAPERS, type Paper, type PdfLayout, renderPdf, renderSvg } from "../export/tree-render.js";
import { MediaService } from "../media/media.service.js";
import { TreeBuilder, treeQuery } from "../tree/tree-builder.service.js";
import { ImportExportService } from "./import-export.service.js";
import { buildTemplate } from "./workbook.js";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_FILE = 10 * 1024 * 1024;

const exportQuery = treeQuery.extend({
  paper: z.enum([...(Object.keys(PAPERS) as Array<keyof typeof PAPERS>), "cuon"]).default("A3"),
  layout: z.enum(["tu-dong", "mot-trang", "nhieu-trang"]).default("tu-dong"),
  /** Kèm ảnh chân dung */
  anh: z.enum(["0", "1"]).default("1"),
});

/** Gửi file tải về: tên file chỉ chữ không dấu (trình duyệt cũ đọc sai tên có dấu) */
function sendFile(res: Response, body: Buffer | string, type: string, name: string) {
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(body);
}

const todayVN = () => {
  const d = new Date(Date.now() + 7 * 3600_000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
};

@Controller("clans/:clanId")
export class ImportExportController {
  constructor(
    private readonly db: Database,
    private readonly io: ImportExportService,
    private readonly builder: TreeBuilder,
    private readonly media: MediaService,
  ) {}

  private ctx(m: Membership) {
    return { clanId: m.clanId, userId: m.userId };
  }

  // ───────────── Nhập từ Excel (quản trị) ─────────────

  @Get("import/template.xlsx")
  async template(@Res() res: Response) {
    sendFile(res, await buildTemplate(), XLSX, "mau-nhap-gia-pha.xlsx");
  }

  /** Bước 1: tải file lên để kiểm tra — chưa ghi gì vào phả */
  @Post("imports")
  @MinRole("admin")
  @RateLimit("import", { limit: 30, windowSec: 3600 })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_FILE, files: 1 } }))
  check(@CurrentMembership() m: Membership, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw unprocessable("FILE_REQUIRED", "Chưa chọn file Excel");
    // multer đọc tên file theo latin1 — đổi lại UTF-8 để giữ tên tiếng Việt
    const name = Buffer.from(file.originalname, "latin1").toString("utf8").slice(0, 200);
    return this.db.withClan(this.ctx(m), (trx) => this.io.check(trx, m, file.buffer, name));
  }

  @Get("imports")
  @MinRole("admin")
  history(@CurrentMembership() m: Membership) {
    return this.db.withClan(this.ctx(m), (trx) => this.io.history(trx));
  }

  @Get("imports/:importId")
  @MinRole("admin")
  get(@CurrentMembership() m: Membership, @Param("importId") id: string) {
    return this.db.withClan(this.ctx(m), (trx) => this.io.get(trx, idSchema.parse(id)));
  }

  @Get("imports/:importId/errors.xlsx")
  @MinRole("admin")
  async errors(@CurrentMembership() m: Membership, @Param("importId") id: string, @Res() res: Response) {
    const buf = await this.db.withClan(this.ctx(m), (trx) => this.io.errorFile(trx, idSchema.parse(id)));
    sendFile(res, buf, XLSX, "gia-pha-danh-dau-loi.xlsx");
  }

  /** Bước 2: xác nhận nhập */
  @Post("imports/:importId/commit")
  @MinRole("admin")
  @HttpCode(200)
  commit(@CurrentMembership() m: Membership, @Param("importId") id: string) {
    return this.db.withClan(this.ctx(m), (trx) => this.io.commit(trx, m, idSchema.parse(id)));
  }

  @Post("imports/:importId/revert")
  @MinRole("admin")
  @HttpCode(204)
  async revert(@CurrentMembership() m: Membership, @Param("importId") id: string) {
    await this.db.withClan(this.ctx(m), (trx) => this.io.revert(trx, m, idSchema.parse(id)));
  }

  // ───────────── Xuất ─────────────

  /** Danh sách Excel đúng mẫu nhập (biên tập viên trở lên) */
  @Get("export/persons.xlsx")
  @MinRole("editor")
  @RateLimit("export", { limit: 30, windowSec: 600 })
  async persons(@CurrentMembership() m: Membership, @Res() res: Response) {
    const { buffer, slug } = await this.db.withClan(this.ctx(m), (trx) => this.io.listWorkbook(trx, m.clanId, ROLE_RANK[m.role] >= ROLE_RANK.admin));
    sendFile(res, buffer, XLSX, `danh-sach-${slug}.xlsx`);
  }

  /** Phả đồ PDF để in: khổ A4–A0 hoặc giấy cuộn; một trang, hay chia nhiều trang để ghép */
  @Get("export/tree.pdf")
  @RateLimit("export", { limit: 30, windowSec: 600 })
  async pdf(@CurrentMembership() m: Membership, @Query() raw: unknown, @Res() res: Response) {
    const q = exportQuery.parse(raw);
    const { scene, slug } = await this.scene(m, q);
    sendFile(res, await renderPdf(scene, q.paper as Paper, q.layout as PdfLayout), "application/pdf", `pha-do-${slug}.pdf`);
  }

  /** Báo trước khi tải PDF: số trang, cỡ chữ khi in, số người, số đời */
  @Get("export/tree-info")
  async info(@CurrentMembership() m: Membership, @Query() raw: unknown) {
    const q = exportQuery.parse({ ...(raw as object), anh: "0" });
    const { scene, people, generations } = await this.scene(m, q);
    return { people, generations, ...describePdf(scene, q.paper as Paper, q.layout as PdfLayout) };
  }

  /** Phả đồ SVG (hình vector, phóng to không vỡ, chỉnh được bằng phần mềm đồ hoạ) */
  @Get("export/tree.svg")
  @RateLimit("export", { limit: 30, windowSec: 600 })
  async svg(@CurrentMembership() m: Membership, @Query() raw: unknown, @Res() res: Response) {
    const q = exportQuery.parse(raw);
    const { scene, slug } = await this.scene(m, q);
    sendFile(res, renderSvg(scene), "image/svg+xml; charset=utf-8", `pha-do-${slug}.svg`);
  }

  private scene(m: Membership, q: z.infer<typeof exportQuery>) {
    const canSeeHidden = ROLE_RANK[m.role] >= ROLE_RANK.admin;
    return this.db.withClan(this.ctx(m), async (trx) => {
      const clan = await trx.selectFrom("clans").select(["name", "slug"]).where("id", "=", m.clanId).executeTakeFirstOrThrow();
      const tree = await this.builder.build(trx, m.clanId, q, canSeeHidden);
      if (!tree.rootId || tree.nodes.length === 0) throw unprocessable("TREE_EMPTY", "Phả đồ chưa có ai để xuất");
      const { persons } = await this.builder.loadGraph(trx, m.clanId);
      const rootGeneration = persons.get(tree.rootId)?.generation ?? 1;
      const avatars = new Map<string, Buffer>();
      if (q.anh === "1") {
        const ids = [...new Set(tree.nodes.map((n) => n.person.avatarMediaId).filter((x): x is string => Boolean(x)))];
        for (const row of await this.media.getMany(trx, ids)) {
          try {
            // ảnh nhỏ đủ nét khi in (thẻ rộng 46 điểm), JPEG để PDF nhúng được
            const jpeg = await sharp(await readFile(this.media.filePath(row, "sm")))
              .resize(138, 180, { fit: "cover" })
              .jpeg({ quality: 82 })
              .toBuffer();
            avatars.set(row.id, jpeg);
          } catch {
            // thiếu file ảnh: in không ảnh
          }
        }
      }
      const scene = buildScene({ tree, clanName: clan.name, rootGeneration, avatars, dateText: todayVN() });
      return { scene, slug: clan.slug, people: tree.nodes.length, generations: new Set(tree.nodes.map((n) => n.depth)).size };
    });
  }
}
