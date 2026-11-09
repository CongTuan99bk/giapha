import { randomUUID } from "node:crypto";
import type { FlexibleDate } from "@coinguon/schemas";
import { Injectable } from "@nestjs/common";
import { sql } from "kysely";
import { audit } from "../common/audit.js";
import type { Membership } from "../common/context.js";
import { conflict, notFound, unprocessable } from "../common/errors.js";
import type { Tx } from "../db/database.js";
import { PersonsService } from "../persons/persons.service.js";
import { GraphService } from "../tree/graph.service.js";
import { type ExistingPerson, type ExistingUnion, planImport, type ImportSummary } from "./import-plan.js";
import { formatAnniversary, formatDate, GENDER_TEXT, type LunarDayMonth, type RawRow, RELATION_TEXT } from "./sheet-format.js";
import { buildErrorWorkbook, buildListWorkbook, type CellError, type ReadRow, readWorkbook } from "./workbook.js";

/** Hoàn tác được trong 24 giờ sau khi nhập */
export const REVERT_HOURS = 24;
/** Kết quả kiểm tra còn dùng để xác nhận trong 24 giờ */
const CHECK_VALID_HOURS = 24;
const MAX_ERRORS_SHOWN = 200;
const BATCH = 500;

interface StoredSummary {
  fileName: string;
  rows: ReadRow[];
  summary: ImportSummary | null;
}
interface StoredErrors {
  errors: CellError[];
  warnings: CellError[];
}
interface CreatedIds {
  persons: string[];
  unions: string[];
  /** Con mới được gắn vào cặp cha mẹ đã có */
  links: string[];
  root: string | null;
}

@Injectable()
export class ImportExportService {
  constructor(
    private readonly persons: PersonsService,
    private readonly graph: GraphService,
  ) {}

  /** Toàn bộ người và cặp vợ chồng đã có — để file nhập nối vào */
  private async context(trx: Tx, clanId: string) {
    const people = await trx
      .selectFrom("persons")
      .select(["id", "full_name", "gender", "in_clan", "generation"])
      .where("deleted_at", "is", null)
      .execute();
    const existing = new Map<string, ExistingPerson>(
      people.map((p) => [p.id, { id: p.id, fullName: p.full_name, gender: p.gender, inClan: p.in_clan, generation: p.generation }]),
    );
    const unions = await trx
      .selectFrom("unions as u")
      .leftJoin("parent_child as pc", "pc.union_id", "u.id")
      .select((eb) => ["u.id", "u.partner_a_id", "u.partner_b_id", eb.fn.max("pc.birth_order").as("max_order")])
      .groupBy(["u.id", "u.partner_a_id", "u.partner_b_id"])
      .execute();
    const existingUnions: ExistingUnion[] = unions.map((u) => ({ id: u.id, a: u.partner_a_id, b: u.partner_b_id, maxChildOrder: Number(u.max_order ?? 0) }));
    const clan = await trx.selectFrom("clans").select("root_person_id").where("id", "=", clanId).executeTakeFirstOrThrow();
    return { existing, existingUnions, clanHasRoot: Boolean(clan.root_person_id) };
  }

  /** Bước 1: đọc file, kiểm tra, lưu kết quả kiểm tra (chưa ghi gì vào phả) */
  async check(trx: Tx, actor: Membership, buffer: Buffer, fileName: string) {
    const read = await readWorkbook(buffer);
    if (!read.ok) throw unprocessable("IMPORT_UNREADABLE", read.message);
    if (read.rows.length === 0) throw unprocessable("IMPORT_EMPTY", "File chưa có dòng nào dưới dòng tiêu đề.");
    const plan = planImport({ rows: read.rows, ...(await this.context(trx, actor.clanId)) });
    if (plan.summary.newPeople === 0 && plan.errors.length === 0) {
      throw unprocessable("IMPORT_NOTHING_NEW", `Tất cả ${plan.summary.skippedExisting} dòng là người đã có trong phả — không có ai mới để nhập.`);
    }
    const id = randomUUID();
    const ok = plan.errors.length === 0;
    const stored: StoredSummary = { fileName, rows: read.rows, summary: plan.summary };
    const errs: StoredErrors = { errors: plan.errors, warnings: plan.warnings };
    await trx
      .insertInto("imports")
      .values({
        id,
        clan_id: actor.clanId,
        created_by: actor.userId,
        format: "xlsx",
        status: ok ? "queued" : "failed",
        summary: JSON.stringify(stored),
        errors: JSON.stringify(errs),
      })
      .execute();
    return this.result(id, ok, fileName, plan.summary, errs);
  }

  private result(id: string, ok: boolean, fileName: string, summary: ImportSummary | null, e: StoredErrors) {
    return {
      id,
      ok,
      fileName,
      summary,
      errorCount: e.errors.length,
      errors: e.errors.slice(0, MAX_ERRORS_SHOWN),
      warnings: e.warnings.slice(0, MAX_ERRORS_SHOWN),
    };
  }

  private async getJob(trx: Tx, id: string) {
    const job = await trx.selectFrom("imports").selectAll().where("id", "=", id).executeTakeFirst();
    if (!job) throw notFound("Không tìm thấy lần nhập này");
    return { ...job, stored: job.summary as unknown as StoredSummary, errs: job.errors as unknown as StoredErrors };
  }

  async errorFile(trx: Tx, id: string): Promise<Buffer> {
    const job = await this.getJob(trx, id);
    return buildErrorWorkbook(job.stored.rows, job.errs.errors);
  }

  /** Bước 2: xác nhận nhập. Kiểm tra lại với dữ liệu hiện tại (phả có thể đã đổi sau khi kiểm tra). */
  async commit(trx: Tx, actor: Membership, id: string) {
    // khoá dòng: bấm "Xác nhận" hai lần cũng chỉ nhập một lần
    const locked = await trx.selectFrom("imports").select("id").where("id", "=", id).forUpdate().executeTakeFirst();
    if (!locked) throw notFound("Không tìm thấy lần nhập này");
    const job = await this.getJob(trx, id);
    if (job.status === "done") throw conflict("IMPORT_ALREADY_DONE", "File này đã được nhập rồi");
    if (job.status !== "queued") throw conflict("IMPORT_HAS_ERRORS", "File còn lỗi — sửa rồi tải lên lại");
    if (Date.now() - new Date(job.created_at).getTime() > CHECK_VALID_HOURS * 3600_000) {
      throw conflict("IMPORT_EXPIRED", "Kết quả kiểm tra đã quá 24 giờ — hãy tải file lên lại");
    }
    const plan = planImport({ rows: job.stored.rows, ...(await this.context(trx, actor.clanId)) });
    if (plan.errors.length) {
      throw conflict("IMPORT_STALE", "Phả đã thay đổi từ lúc kiểm tra, file không còn khớp — hãy tải file lên lại để kiểm tra", {
        errors: plan.errors.slice(0, MAX_ERRORS_SHOWN),
      });
    }

    // ghi theo lô (500 dòng một lần): 2.000 người chỉ vài chục câu lệnh
    const idOf = new Map<string, string>();
    const personRows = plan.persons.map((p) => {
      const id = randomUUID();
      idOf.set(p.code, id);
      const values = this.persons.personValues(actor.clanId, p.input, id);
      return p.anniversary ? { ...values, death_anniv_lunar: JSON.stringify(p.anniversary) } : values;
    });
    for (let i = 0; i < personRows.length; i += BATCH) await trx.insertInto("persons").values(personRows.slice(i, i + BATCH)).execute();
    const facts = plan.persons.flatMap((p) => this.persons.factRows(actor.clanId, idOf.get(p.code)!, p.input.facts));
    for (let i = 0; i < facts.length; i += BATCH) await trx.insertInto("person_facts").values(facts.slice(i, i + BATCH)).execute();
    const resolve = (r: { kind: "new"; code: string } | { kind: "old"; id: string }) => (r.kind === "new" ? idOf.get(r.code)! : r.id);
    const unionId = new Map<string, string>();
    const createdUnions: string[] = [];
    const unionRows = plan.unions.map((u) => {
      const id = randomUUID();
      unionId.set(u.key, id);
      createdUnions.push(id);
      return { id, clan_id: actor.clanId, partner_a_id: resolve(u.a), partner_b_id: u.b ? resolve(u.b) : null, order_index: u.orderIndex };
    });
    for (let i = 0; i < unionRows.length; i += BATCH) await trx.insertInto("unions").values(unionRows.slice(i, i + BATCH)).execute();
    const linkedToOld: string[] = [];
    const linkRows = plan.links.map((l) => {
      const uid = unionId.get(l.unionKey) ?? l.unionKey.slice(2); // "u:<id>" = cặp đã có
      if (!unionId.has(l.unionKey)) linkedToOld.push(idOf.get(l.childCode)!);
      return { clan_id: actor.clanId, union_id: uid, child_id: idOf.get(l.childCode)!, relation: l.relation, birth_order: l.birthOrder };
    });
    for (let i = 0; i < linkRows.length; i += BATCH) await trx.insertInto("parent_child").values(linkRows.slice(i, i + BATCH)).execute();
    const root = plan.rootCode ? idOf.get(plan.rootCode)! : null;
    if (root) await trx.updateTable("clans").set({ root_person_id: root, updated_at: new Date() }).where("id", "=", actor.clanId).execute();
    await this.graph.recomputeLineage(trx, actor.clanId);

    const created: CreatedIds = { persons: [...idOf.values()], unions: createdUnions, links: linkedToOld, root };
    await trx
      .updateTable("imports")
      .set({ status: "done", committed_at: new Date(), created_ids: JSON.stringify(created) })
      .where("id", "=", id)
      .execute();
    await audit(trx, { clanId: actor.clanId, actorId: actor.userId, action: "import.commit", entity: "import", entityId: id, after: plan.summary });
    return { id, created: created.persons.length, summary: plan.summary };
  }

  /** Hoàn tác trong 24 giờ: xoá người, cặp vợ chồng, quan hệ con do lần nhập tạo ra */
  async revert(trx: Tx, actor: Membership, id: string) {
    const locked = await trx.selectFrom("imports").select("id").where("id", "=", id).forUpdate().executeTakeFirst();
    if (!locked) throw notFound("Không tìm thấy lần nhập này");
    const job = await this.getJob(trx, id);
    if (job.status !== "done" || !job.committed_at) throw conflict("IMPORT_NOT_COMMITTED", "Lần nhập này chưa được xác nhận");
    if (job.reverted_at) throw conflict("IMPORT_ALREADY_REVERTED", "Lần nhập này đã được hoàn tác");
    if (Date.now() - new Date(job.committed_at).getTime() > REVERT_HOURS * 3600_000) {
      throw conflict("IMPORT_REVERT_EXPIRED", `Chỉ hoàn tác được trong ${REVERT_HOURS} giờ sau khi nhập`);
    }
    const c = job.created_ids as unknown as CreatedIds;
    const persons = c.persons.length ? c.persons : ["00000000-0000-0000-0000-000000000000"];
    const unions = c.unions.length ? c.unions : ["00000000-0000-0000-0000-000000000000"];
    // sau khi nhập đã có người nối thêm vào → hoàn tác sẽ làm đứt cây
    const foreignUnion = await trx
      .selectFrom("unions")
      .select("id")
      .where((eb) => eb.or([eb("partner_a_id", "in", persons), eb("partner_b_id", "in", persons)]))
      .where("id", "not in", unions)
      .executeTakeFirst();
    const foreignChild = await trx
      .selectFrom("parent_child as pc")
      .innerJoin("persons as p", "p.id", "pc.child_id")
      .select("pc.child_id")
      .where("pc.union_id", "in", unions)
      .where("pc.child_id", "not in", persons)
      .where("p.deleted_at", "is", null)
      .executeTakeFirst();
    if (foreignUnion || foreignChild) {
      throw conflict(
        "IMPORT_REVERT_BLOCKED",
        "Sau lần nhập này đã có người được thêm nối vào những người vừa nhập (vợ/chồng hoặc con). Hãy xoá những người thêm sau trước, hoặc sửa từng người trên phả đồ.",
      );
    }
    await trx.deleteFrom("parent_child").where((eb) => eb.or([eb("child_id", "in", persons), eb("union_id", "in", unions)])).execute();
    await trx.deleteFrom("unions").where("id", "in", unions).execute();
    await trx.updateTable("persons").set({ deleted_at: new Date(), updated_at: new Date() }).where("id", "in", persons).execute();
    if (c.root) {
      await trx.updateTable("clans").set({ root_person_id: null, updated_at: new Date() }).where("id", "=", actor.clanId).where("root_person_id", "=", c.root).execute();
    }
    await this.graph.recomputeLineage(trx, actor.clanId);
    await trx.updateTable("imports").set({ reverted_at: new Date() }).where("id", "=", id).execute();
    await audit(trx, { clanId: actor.clanId, actorId: actor.userId, action: "import.revert", entity: "import", entityId: id, after: { persons: c.persons.length } });
  }

  /** Lịch sử nhập (30 lần gần nhất) */
  async history(trx: Tx) {
    const rows = await trx
      .selectFrom("imports as i")
      .leftJoin("users as u", "u.id", "i.created_by")
      .select(["i.id", "i.status", "i.summary", "i.errors", "i.created_at", "i.committed_at", "i.reverted_at", "u.name as by"])
      .orderBy("i.created_at", "desc")
      .limit(30)
      .execute();
    const now = Date.now();
    return rows.map((r) => {
      const s = r.summary as unknown as StoredSummary | null;
      const e = r.errors as unknown as StoredErrors | null;
      const committed = r.committed_at ? new Date(r.committed_at) : null;
      return {
        id: r.id,
        status: r.reverted_at ? "reverted" : r.status === "done" ? "done" : r.status === "failed" ? "failed" : "checked",
        fileName: s?.fileName ?? "",
        summary: s?.summary ?? null,
        errorCount: e?.errors.length ?? 0,
        createdAt: r.created_at,
        committedAt: r.committed_at,
        revertedAt: r.reverted_at,
        by: r.by,
        canRevert: Boolean(committed && !r.reverted_at && now - committed.getTime() < REVERT_HOURS * 3600_000),
        revertUntil: committed ? new Date(committed.getTime() + REVERT_HOURS * 3600_000) : null,
      };
    });
  }

  /** Bước 1 xem lại: kết quả kiểm tra đã lưu */
  async get(trx: Tx, id: string) {
    const job = await this.getJob(trx, id);
    return { ...this.result(job.id, job.status === "queued", job.stored.fileName, job.stored.summary, job.errs), status: job.status };
  }

  /**
   * Danh sách người theo đúng mẫu nhập (mã = mã trong hệ thống) — thêm dòng rồi nhập lại được.
   * `canSeeHidden`: người "ẩn thông tin" chỉ quản trị thấy đủ.
   */
  async listWorkbook(trx: Tx, clanId: string, canSeeHidden: boolean) {
    const clan = await trx.selectFrom("clans").select(["name", "slug"]).where("id", "=", clanId).executeTakeFirstOrThrow();
    const people = await trx
      .selectFrom("persons")
      .select([
        "id",
        "full_name",
        "gender",
        "is_living",
        "birth_date",
        "death_date",
        "death_anniv_lunar",
        "other_names",
        "biography",
        "privacy",
        "generation",
        "lineage_path",
      ])
      .where("deleted_at", "is", null)
      .orderBy(sql`generation nulls last`)
      .orderBy(sql`lineage_path nulls last`)
      .orderBy("created_at")
      .execute();
    const facts = await trx.selectFrom("person_facts").select(["person_id", "type", "value"]).execute();
    const factOf = new Map<string, Record<string, string>>();
    for (const f of facts) (factOf.get(f.person_id) ?? factOf.set(f.person_id, {}).get(f.person_id)!)[f.type] = f.value;
    const unions = await trx.selectFrom("unions").select(["id", "partner_a_id", "partner_b_id", "order_index"]).orderBy("order_index").execute();
    const links = await trx.selectFrom("parent_child").select(["union_id", "child_id", "relation", "birth_order"]).execute();
    const genderOf = new Map(people.map((p) => [p.id, p.gender]));
    const unionById = new Map(unions.map((u) => [u.id, u]));
    const spousesOf = new Map<string, string[]>();
    for (const u of unions) if (u.partner_b_id) (spousesOf.get(u.partner_a_id) ?? spousesOf.set(u.partner_a_id, []).get(u.partner_a_id)!).push(u.partner_b_id);
    const parentOf = new Map<string, { father: string | null; mother: string | null; relation: string; order: number }>();
    for (const l of links) {
      const u = unionById.get(l.union_id);
      if (!u) continue;
      // người trong cặp: nam ghi Mã cha, nữ ghi Mã mẹ (không rõ giới tính: người đứng trước là cha)
      const pair = [u.partner_a_id, u.partner_b_id].filter((x): x is string => Boolean(x));
      let father = pair.find((x) => genderOf.get(x) === "male") ?? null;
      let mother = pair.find((x) => genderOf.get(x) === "female") ?? null;
      for (const x of pair) {
        if (x === father || x === mother) continue;
        if (!father) father = x;
        else if (!mother) mother = x;
      }
      parentOf.set(l.child_id, { father, mother, relation: l.relation, order: l.birth_order });
    }
    const rows = people.map((p) => {
      const hidden = p.privacy === "hidden" && !canSeeHidden;
      const par = parentOf.get(p.id);
      const death = p.death_date as FlexibleDate | null;
      const anniv = p.death_anniv_lunar as LunarDayMonth | null;
      const f = factOf.get(p.id) ?? {};
      const row: RawRow & { doi?: number | null } = {
        ma: p.id,
        hoTen: hidden ? "Thông tin ẩn" : p.full_name,
        gioiTinh: GENDER_TEXT[p.gender],
        maCha: par?.father ?? "",
        maMe: par?.mother ?? "",
        quanHe: par && par.relation !== "biological" ? RELATION_TEXT[par.relation as keyof typeof RELATION_TEXT] : "",
        thuTu: par ? String(par.order) : "",
        maVoChong: (spousesOf.get(p.id) ?? []).join("; "),
        doi: p.generation,
      };
      if (!hidden) {
        Object.assign(row, {
          tenKhac: ((p.other_names as Array<{ value: string }> | null) ?? []).map((o) => o.value).join("; "),
          ngaySinh: formatDate(p.birth_date as FlexibleDate | null),
          ngayMat: formatDate(death),
          // ngày giỗ chỉ ghi riêng khi không suy được từ ngày mất
          ngayGio: death?.precision === "day" ? "" : formatAnniversary(anniv),
          daMat: !p.is_living && !death && !anniv ? "x" : "",
          queQuan: f.birthPlace ?? "",
          ngheNghiep: f.occupation ?? "",
          noiAnTang: f.burialPlace ?? "",
          tieuSu: (p.biography as { text?: string } | null)?.text ?? "",
        });
      }
      return row;
    });
    return { buffer: await buildListWorkbook(rows, `Danh sách ${clan.name}`), slug: clan.slug };
  }
}
