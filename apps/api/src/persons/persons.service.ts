import { randomUUID } from "node:crypto";
import { solarToLunar } from "@coinguon/lunar-vn";
import {
  defaultPrivacy,
  type FlexibleDate,
  type ParentLinkInput,
  PERSON_FACT_TYPES,
  type PersonCreateInput,
  type PersonFacts,
  type PersonUpdateInput,
} from "@coinguon/schemas";
import { Injectable } from "@nestjs/common";
import { sql, type Selectable } from "kysely";
import { audit } from "../common/audit.js";
import { conflict, notFound, unprocessable } from "../common/errors.js";
import type { Tx } from "../db/database.js";
import type { Persons } from "../db/generated.js";
import { GraphService } from "../tree/graph.service.js";

type PersonRow = Selectable<Persons>;

/** Ngày giỗ âm lịch suy từ ngày mất (BR-LUNAR-02, 05). Không đủ ngày/tháng → null. */
export function deathAnniversaryOf(death: FlexibleDate | null | undefined) {
  if (!death || death.precision !== "day" || !death.day || !death.month) return null;
  if (death.calendar === "lunar") {
    return { day: death.day, month: death.month, isLeapMonth: Boolean(death.isLeapMonth) };
  }
  try {
    const l = solarToLunar({ day: death.day, month: death.month, year: death.year });
    return { day: l.day, month: l.month, isLeapMonth: l.isLeapMonth };
  } catch {
    return null;
  }
}

export function toPersonDto(p: PersonRow) {
  return {
    id: p.id,
    fullName: p.full_name,
    otherNames: p.other_names,
    gender: p.gender,
    isLiving: p.is_living,
    birthDate: p.birth_date,
    deathDate: p.death_date,
    deathAnniversaryLunar: p.death_anniv_lunar,
    birthYear: p.birth_year,
    generation: p.generation,
    inClan: p.in_clan,
    lineagePath: p.lineage_path,
    privacy: p.privacy,
    avatarMediaId: p.avatar_media_id,
    biography: p.biography,
    version: p.version,
    updatedAt: p.updated_at,
  };
}

const json = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));

interface Actor {
  clanId: string;
  userId: string;
}

@Injectable()
export class PersonsService {
  constructor(private readonly graph: GraphService) {}

  /** Giá trị một dòng persons từ dữ liệu nhập (dùng chung cho thêm một người và nhập hàng loạt từ Excel) */
  personValues(clanId: string, input: PersonCreateInput, id: string = randomUUID()) {
    return {
      id,
      clan_id: clanId,
      full_name: input.fullName,
      other_names: JSON.stringify(input.otherNames ?? []),
      gender: input.gender,
      is_living: input.isLiving,
      birth_date: json(input.birthDate),
      death_date: json(input.deathDate),
      death_anniv_lunar: json(deathAnniversaryOf(input.deathDate)),
      biography: json(input.biography?.text ? input.biography : null),
      privacy: input.privacy ?? defaultPrivacy(input.isLiving),
      branch_id: input.branchId ?? null,
      updated_at: new Date(),
    };
  }

  /** Quê quán, nghề nghiệp, nơi an táng của người mới (dòng person_facts) */
  factRows(clanId: string, personId: string, facts: PersonFacts | undefined) {
    return PERSON_FACT_TYPES.flatMap((type) => {
      const value = facts?.[type]?.trim();
      return value ? [{ id: randomUUID(), clan_id: clanId, person_id: personId, type, value }] : [];
    });
  }

  async insertPerson(trx: Tx, clanId: string, input: PersonCreateInput): Promise<PersonRow> {
    const row = await trx
      .insertInto("persons")
      .values({
        id: randomUUID(),
        clan_id: clanId,
        full_name: input.fullName,
        other_names: JSON.stringify(input.otherNames ?? []),
        gender: input.gender,
        is_living: input.isLiving,
        birth_date: json(input.birthDate),
        death_date: json(input.deathDate),
        death_anniv_lunar: json(deathAnniversaryOf(input.deathDate)),
        biography: json(input.biography?.text ? input.biography : null),
        privacy: input.privacy ?? defaultPrivacy(input.isLiving),
        branch_id: input.branchId ?? null,
        updated_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    if (input.facts) await this.saveFacts(trx, clanId, row.id, input.facts);
    return row;
  }

  /** Ghi quê quán, nghề nghiệp, nơi an táng: trường có mặt thì thay, null/rỗng thì xoá; trường vắng mặt giữ nguyên. */
  private async saveFacts(trx: Tx, clanId: string, personId: string, facts: PersonFacts) {
    for (const type of PERSON_FACT_TYPES) {
      if (!(type in facts)) continue;
      const value = facts[type]?.trim();
      await trx.deleteFrom("person_facts").where("person_id", "=", personId).where("type", "=", type).execute();
      if (value) await trx.insertInto("person_facts").values({ id: randomUUID(), clan_id: clanId, person_id: personId, type, value }).execute();
    }
  }

  async factsOf(trx: Tx, personId: string): Promise<Record<string, string>> {
    const rows = await trx.selectFrom("person_facts").select(["type", "value"]).where("person_id", "=", personId).orderBy("sort_order").execute();
    return Object.fromEntries(rows.map((r) => [r.type, r.value]));
  }

  async getActive(trx: Tx, id: string): Promise<PersonRow> {
    const p = await trx.selectFrom("persons").selectAll().where("id", "=", id).where("deleted_at", "is", null).executeTakeFirst();
    if (!p) throw notFound("Không tìm thấy người này");
    return p;
  }

  /** Tạo người độc lập; nếu dòng họ chưa có thuỷ tổ, người đầu tiên thành thuỷ tổ. */
  async create(trx: Tx, a: Actor, input: PersonCreateInput) {
    const person = await this.insertPerson(trx, a.clanId, input);
    const clan = await trx.selectFrom("clans").select("root_person_id").where("id", "=", a.clanId).executeTakeFirstOrThrow();
    if (!clan.root_person_id) {
      await trx.updateTable("clans").set({ root_person_id: person.id, updated_at: new Date() }).where("id", "=", a.clanId).execute();
    }
    await this.graph.recomputeLineage(trx, a.clanId);
    await audit(trx, { ...this.auditBase(a), action: "person.create", entity: "person", entityId: person.id, after: input });
    return toPersonDto(await this.getActive(trx, person.id));
  }

  /**
   * Đặt/gỡ ảnh chân dung. Không tăng `version`: đổi ảnh không xung đột với người đang sửa chữ cùng lúc.
   * Ảnh phải thuộc dòng họ hiện tại (RLS) và chưa bị xoá.
   */
  async setAvatar(trx: Tx, a: Actor, id: string, mediaId: string | null) {
    const before = await this.getActive(trx, id);
    if (mediaId) {
      const m = await trx.selectFrom("media").select("id").where("id", "=", mediaId).where("deleted_at", "is", null).executeTakeFirst();
      if (!m) throw unprocessable("MEDIA_NOT_FOUND", "Không tìm thấy ảnh");
    }
    await trx.updateTable("persons").set({ avatar_media_id: mediaId, updated_at: new Date() }).where("id", "=", id).execute();
    await audit(trx, {
      ...this.auditBase(a),
      action: "person.avatar",
      entity: "person",
      entityId: id,
      before: { avatarMediaId: before.avatar_media_id },
      after: { avatarMediaId: mediaId },
    });
    return toPersonDto(await this.getActive(trx, id));
  }

  /** Sửa hồ sơ với khoá lạc quan (BR-TREE-07). */
  async update(trx: Tx, a: Actor, id: string, input: PersonUpdateInput) {
    const before = await this.getActive(trx, id);
    const isLiving = input.isLiving ?? before.is_living;
    const deathDate = input.deathDate !== undefined ? input.deathDate : (before.death_date as FlexibleDate | null);
    if (isLiving && deathDate) throw unprocessable("LIVING_WITH_DEATH_DATE", "Người còn sống không có ngày mất");

    const updated = await trx
      .updateTable("persons")
      .set({
        ...(input.fullName !== undefined && { full_name: input.fullName }),
        ...(input.otherNames !== undefined && { other_names: JSON.stringify(input.otherNames) }),
        ...(input.gender !== undefined && { gender: input.gender }),
        ...(input.isLiving !== undefined && { is_living: input.isLiving }),
        ...(input.birthDate !== undefined && { birth_date: json(input.birthDate) }),
        ...(input.deathDate !== undefined && {
          death_date: json(input.deathDate),
          death_anniv_lunar: json(deathAnniversaryOf(input.deathDate)),
        }),
        ...(input.privacy !== undefined && { privacy: input.privacy }),
        ...(input.branchId !== undefined && { branch_id: input.branchId }),
        ...(input.biography !== undefined && { biography: json(input.biography?.text ? input.biography : null) }),
        version: sql<number>`version + 1`,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .where("version", "=", input.version)
      .returningAll()
      .executeTakeFirst();
    if (!updated) {
      throw conflict("PERSON_VERSION_CONFLICT", "Hồ sơ vừa được người khác sửa. Vui lòng tải lại để xem bản mới nhất.", {
        currentVersion: before.version,
      });
    }
    if (input.facts) await this.saveFacts(trx, a.clanId, id, input.facts);
    if (input.gender !== undefined && input.gender !== before.gender) {
      await this.graph.recomputeLineage(trx, a.clanId); // giới tính ảnh hưởng tính "thuộc họ"
    }
    await audit(trx, {
      ...this.auditBase(a),
      action: "person.update",
      entity: "person",
      entityId: id,
      before: toPersonDto(before),
      after: input,
    });
    return toPersonDto((await this.getActive(trx, id)));
  }

  /** Xoá mềm (BR-TREE-06): có con cháu phải xác nhận; không xoá thuỷ tổ. */
  async remove(trx: Tx, a: Actor, id: string, confirmed: boolean) {
    const p = await this.getActive(trx, id);
    const clan = await trx.selectFrom("clans").select("root_person_id").where("id", "=", a.clanId).executeTakeFirstOrThrow();
    if (clan.root_person_id === id) {
      throw conflict("IS_ROOT_PERSON", "Không thể xoá thuỷ tổ. Hãy chọn người khác làm thuỷ tổ trước.");
    }
    const children = await trx
      .selectFrom("parent_child as pc")
      .innerJoin("unions as u", "u.id", "pc.union_id")
      .innerJoin("persons as c", "c.id", "pc.child_id")
      .select("pc.child_id")
      .where((eb) => eb.or([eb("u.partner_a_id", "=", id), eb("u.partner_b_id", "=", id)]))
      .where("c.deleted_at", "is", null)
      .execute();
    if (children.length > 0 && !confirmed) {
      throw conflict("HAS_DESCENDANTS", "Người này có con cháu. Xác nhận chỉ xoá người này và giữ con cháu?", {
        childCount: children.length,
      });
    }
    await trx.updateTable("persons").set({ deleted_at: new Date(), updated_at: new Date() }).where("id", "=", id).execute();
    await this.graph.recomputeLineage(trx, a.clanId);
    await audit(trx, { ...this.auditBase(a), action: "person.delete", entity: "person", entityId: id, before: toPersonDto(p) });
  }

  /** FR-TREE-03/04: thêm con cho một người, gắn đúng hôn phối. */
  async addChild(
    trx: Tx,
    a: Actor,
    parentId: string,
    input: { unionId?: string | undefined; relation: "biological" | "adopted" | "step"; person: PersonCreateInput },
  ) {
    await this.getActive(trx, parentId);
    const unions = await this.unionsOf(trx, parentId);
    let unionId: string;
    if (input.unionId) {
      if (!unions.some((u) => u.id === input.unionId)) {
        throw unprocessable("UNION_NOT_OF_PERSON", "Hôn phối được chọn không thuộc người này");
      }
      unionId = input.unionId;
    } else if (unions.length === 1) {
      unionId = unions[0]!.id;
    } else if (unions.length === 0) {
      unionId = randomUUID();
      await trx
        .insertInto("unions")
        .values({ id: unionId, clan_id: a.clanId, partner_a_id: parentId, partner_b_id: null, order_index: 1 })
        .execute();
    } else {
      throw unprocessable("UNION_REQUIRED", "Người này có nhiều vợ/chồng — hãy chọn con thuộc cặp nào", {
        unions: unions.map((u) => ({ id: u.id, partnerId: u.partner_a_id === parentId ? u.partner_b_id : u.partner_a_id })),
      });
    }
    const { max } = await trx
      .selectFrom("parent_child")
      .select((eb) => eb.fn.max("birth_order").as("max"))
      .where("union_id", "=", unionId)
      .executeTakeFirstOrThrow();
    const child = await this.insertPerson(trx, a.clanId, input.person);
    await trx
      .insertInto("parent_child")
      .values({
        clan_id: a.clanId,
        union_id: unionId,
        child_id: child.id,
        relation: input.relation,
        birth_order: (max ?? 0) + 1,
      })
      .execute();
    await this.graph.recomputeLineage(trx, a.clanId);
    await audit(trx, { ...this.auditBase(a), action: "person.addChild", entity: "person", entityId: child.id, after: { parentId, unionId, ...input } });
    return { unionId, person: toPersonDto(await this.getActive(trx, child.id)) };
  }

  /** Thêm vợ/chồng: người mới hoặc người đã có trong cây. */
  async addSpouse(
    trx: Tx,
    a: Actor,
    personId: string,
    input: { existingPersonId?: string | undefined; person?: PersonCreateInput | undefined; type: "marriage" | "partnership" | "other" },
  ) {
    await this.getActive(trx, personId);
    const unions = await this.unionsOf(trx, personId);
    let spouseId: string;
    if (input.existingPersonId) {
      if (input.existingPersonId === personId) throw unprocessable("SELF_UNION", "Không thể kết hôn với chính mình");
      await this.getActive(trx, input.existingPersonId);
      if (unions.some((u) => u.partner_a_id === input.existingPersonId || u.partner_b_id === input.existingPersonId)) {
        throw conflict("ALREADY_SPOUSES", "Hai người đã là vợ chồng");
      }
      spouseId = input.existingPersonId;
    } else {
      spouseId = (await this.insertPerson(trx, a.clanId, input.person!)).id;
    }
    // Hôn phối "chưa rõ vợ/chồng" đầu tiên (có con) được gán vợ/chồng thay vì tạo cặp mới
    const unknown = unions.find((u) => u.partner_a_id === personId && u.partner_b_id === null);
    let unionId: string;
    if (unknown) {
      unionId = unknown.id;
      await trx.updateTable("unions").set({ partner_b_id: spouseId, type: input.type }).where("id", "=", unionId).execute();
    } else {
      unionId = randomUUID();
      await trx
        .insertInto("unions")
        .values({
          id: unionId,
          clan_id: a.clanId,
          partner_a_id: personId,
          partner_b_id: spouseId,
          type: input.type,
          order_index: unions.filter((u) => u.partner_a_id === personId).length + 1,
        })
        .execute();
    }
    await this.graph.recomputeLineage(trx, a.clanId);
    await audit(trx, { ...this.auditBase(a), action: "person.addSpouse", entity: "union", entityId: unionId, after: { personId, spouseId } });
    return { unionId, person: toPersonDto(await this.getActive(trx, spouseId)) };
  }

  /** Thêm cha/mẹ cho người chưa có cha mẹ; nếu là thuỷ tổ thì cha/mẹ mới thành thuỷ tổ. */
  async addParent(trx: Tx, a: Actor, childId: string, input: { person: PersonCreateInput }) {
    await this.getActive(trx, childId);
    const existing = await trx
      .selectFrom("parent_child")
      .select("union_id")
      .where("child_id", "=", childId)
      .where("relation", "!=", "step")
      .executeTakeFirst();
    if (existing) {
      throw conflict("HAS_PARENTS", "Người này đã có cha/mẹ. Hãy thêm vợ/chồng cho cha/mẹ hiện có.");
    }
    const parent = await this.insertPerson(trx, a.clanId, input.person);
    const unionId = randomUUID();
    await trx
      .insertInto("unions")
      .values({ id: unionId, clan_id: a.clanId, partner_a_id: parent.id, partner_b_id: null, order_index: 1 })
      .execute();
    await trx
      .insertInto("parent_child")
      .values({ clan_id: a.clanId, union_id: unionId, child_id: childId, relation: "biological", birth_order: 1 })
      .execute();
    const clan = await trx.selectFrom("clans").select("root_person_id").where("id", "=", a.clanId).executeTakeFirstOrThrow();
    if (clan.root_person_id === childId) {
      await trx.updateTable("clans").set({ root_person_id: parent.id, updated_at: new Date() }).where("id", "=", a.clanId).execute();
    }
    await this.graph.recomputeLineage(trx, a.clanId);
    await audit(trx, { ...this.auditBase(a), action: "person.addParent", entity: "person", entityId: parent.id, after: { childId, unionId } });
    return { unionId, person: toPersonDto(await this.getActive(trx, parent.id)) };
  }

  /** FR-TREE-05: sắp lại thứ tự con của một hôn phối (danh sách phải đủ và đúng các con). */
  async reorderChildren(trx: Tx, a: Actor, unionId: string, childIds: string[]) {
    const current = await trx.selectFrom("parent_child").select("child_id").where("union_id", "=", unionId).execute();
    if (current.length === 0) throw notFound("Không tìm thấy hôn phối hoặc hôn phối chưa có con");
    const same =
      current.length === childIds.length && current.every((c) => childIds.includes(c.child_id));
    if (!same) throw unprocessable("CHILD_LIST_MISMATCH", "Danh sách con không khớp với dữ liệu hiện tại");
    // Dời tạm để không vướng ràng buộc duy nhất (union_id, birth_order)
    await trx.updateTable("parent_child").set({ birth_order: sql<number>`birth_order + 100000` }).where("union_id", "=", unionId).execute();
    for (const [i, childId] of childIds.entries()) {
      await trx
        .updateTable("parent_child")
        .set({ birth_order: i + 1 })
        .where("union_id", "=", unionId)
        .where("child_id", "=", childId)
        .execute();
    }
    await this.graph.recomputeLineage(trx, a.clanId);
    await audit(trx, { ...this.auditBase(a), action: "union.reorderChildren", entity: "union", entityId: unionId, after: { childIds } });
  }

  /** Đánh số lại thứ tự con của một hôn phối thành 1, 2, 3… (sau khi chuyển một người con đi) */
  private async compactChildren(trx: Tx, unionId: string) {
    await trx.updateTable("parent_child").set({ birth_order: sql<number>`birth_order + 100000` }).where("union_id", "=", unionId).execute();
    await sql`
      update parent_child pc set birth_order = r.rn
      from (select child_id, row_number() over (order by birth_order) as rn from parent_child where union_id = ${unionId}) r
      where pc.union_id = ${unionId} and pc.child_id = r.child_id`.execute(trx);
  }

  /** Hôn phối của cha/mẹ để gắn con: chọn sẵn, duy nhất, hoặc tạo cặp "chưa rõ vợ/chồng" */
  private async resolveParentUnion(trx: Tx, clanId: string, parentId: string, unionId: string | undefined) {
    const unions = await this.unionsOf(trx, parentId);
    if (unionId) {
      if (!unions.some((u) => u.id === unionId)) throw unprocessable("UNION_NOT_OF_PERSON", "Hôn phối được chọn không thuộc người này");
      return unionId;
    }
    if (unions.length === 1) return unions[0]!.id;
    if (unions.length === 0) {
      const id = randomUUID();
      await trx.insertInto("unions").values({ id, clan_id: clanId, partner_a_id: parentId, partner_b_id: null, order_index: 1 }).execute();
      return id;
    }
    throw unprocessable("UNION_REQUIRED", "Người này có nhiều vợ/chồng — hãy chọn con thuộc cặp nào", {
      unions: unions.map((u) => ({ id: u.id, partnerId: u.partner_a_id === parentId ? u.partner_b_id : u.partner_a_id })),
    });
  }

  /**
   * FR-TREE-08: đặt cha mẹ cho một người — gắn người chưa có cha mẹ, chuyển sang cha mẹ khác khi nhập nhầm,
   * hoặc chỉ đổi con ruột/nuôi/riêng. Con riêng ("step") được thêm bên cạnh cha mẹ ruột; ruột/nuôi thì thay cha mẹ cũ.
   * Vòng lặp tổ tiên bị trigger ANCESTOR_CYCLE chặn.
   */
  async setParentLink(trx: Tx, a: Actor, childId: string, input: ParentLinkInput) {
    await this.getActive(trx, childId);
    if (input.parentId === childId) throw unprocessable("SELF_PARENT", "Một người không thể là cha/mẹ của chính mình");
    await this.getActive(trx, input.parentId);
    const clan = await trx.selectFrom("clans").select("root_person_id").where("id", "=", a.clanId).executeTakeFirstOrThrow();
    if (clan.root_person_id === childId) {
      throw conflict("IS_ROOT_PERSON", "Thuỷ tổ không gắn vào cha mẹ khác. Dùng “Thêm cha/mẹ”, hoặc đổi thuỷ tổ trong Cài đặt.");
    }
    const unionId = await this.resolveParentUnion(trx, a.clanId, input.parentId, input.unionId);
    const links = await trx.selectFrom("parent_child").select(["union_id", "relation"]).where("child_id", "=", childId).execute();
    const before = links.map((l) => ({ unionId: l.union_id, relation: l.relation }));

    const same = links.find((l) => l.union_id === unionId);
    if (same) {
      // Đã là con của cặp này: chỉ đổi loại quan hệ
      await trx.updateTable("parent_child").set({ relation: input.relation }).where("union_id", "=", unionId).where("child_id", "=", childId).execute();
    } else {
      const moved = input.relation === "step" ? [] : links.filter((l) => l.relation !== "step").map((l) => l.union_id);
      if (moved.length) {
        await trx.deleteFrom("parent_child").where("child_id", "=", childId).where("union_id", "in", moved).execute();
        for (const old of moved) {
          await this.compactChildren(trx, old);
          // cặp "chưa rõ vợ/chồng" tạo ra chỉ để giữ người con này thì bỏ luôn
          const left = await trx.selectFrom("parent_child").select("child_id").where("union_id", "=", old).executeTakeFirst();
          if (!left) await trx.deleteFrom("unions").where("id", "=", old).where("partner_b_id", "is", null).execute();
        }
      }
      const { max } = await trx
        .selectFrom("parent_child")
        .select((eb) => eb.fn.max("birth_order").as("max"))
        .where("union_id", "=", unionId)
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("parent_child")
        .values({ clan_id: a.clanId, union_id: unionId, child_id: childId, relation: input.relation, birth_order: (max ?? 0) + 1 })
        .execute();
    }
    await this.graph.recomputeLineage(trx, a.clanId);
    await audit(trx, { ...this.auditBase(a), action: "person.setParents", entity: "person", entityId: childId, before, after: { ...input, unionId } });
    return this.detail(trx, childId);
  }

  /** Thứ tự vợ/chồng (vợ cả = 1): chỉ các hôn phối người này đứng đầu (partner_a), phải đủ danh sách */
  async reorderUnions(trx: Tx, a: Actor, personId: string, unionIds: string[]) {
    await this.getActive(trx, personId);
    const own = (await this.unionsOf(trx, personId)).filter((u) => u.partner_a_id === personId);
    if (own.length !== unionIds.length || !own.every((u) => unionIds.includes(u.id))) {
      throw unprocessable("UNION_LIST_MISMATCH", "Danh sách vợ/chồng không khớp với dữ liệu hiện tại");
    }
    for (const [i, id] of unionIds.entries()) await trx.updateTable("unions").set({ order_index: i + 1 }).where("id", "=", id).execute();
    await this.graph.recomputeLineage(trx, a.clanId);
    await audit(trx, { ...this.auditBase(a), action: "person.reorderUnions", entity: "person", entityId: personId, after: { unionIds } });
  }

  /** Gỡ quan hệ vợ chồng nhập nhầm (không xoá người). Có con chung thì phải chuyển con sang cha mẹ khác trước. */
  async removeUnion(trx: Tx, a: Actor, unionId: string) {
    const u = await trx.selectFrom("unions").selectAll().where("id", "=", unionId).where("deleted_at", "is", null).executeTakeFirst();
    if (!u) throw notFound("Không tìm thấy quan hệ vợ chồng");
    const child = await trx.selectFrom("parent_child").select("child_id").where("union_id", "=", unionId).executeTakeFirst();
    if (child) throw conflict("UNION_HAS_CHILDREN", "Hai người có con chung. Hãy chuyển các con sang cha mẹ đúng trước khi gỡ.");
    // Xoá hẳn (không có gì tham chiếu) để sau này nối lại hai người không vướng ràng buộc duy nhất
    await trx.deleteFrom("unions").where("id", "=", unionId).execute();
    const rest = (await this.unionsOf(trx, u.partner_a_id)).filter((x) => x.partner_a_id === u.partner_a_id);
    for (const [i, x] of rest.entries()) await trx.updateTable("unions").set({ order_index: i + 1 }).where("id", "=", x.id).execute();
    await this.graph.recomputeLineage(trx, a.clanId);
    await audit(trx, { ...this.auditBase(a), action: "union.remove", entity: "union", entityId: unionId, before: u });
  }

  async detail(trx: Tx, id: string) {
    const p = await this.getActive(trx, id);
    const unions = await this.unionsOf(trx, id);
    const parentLinks = await trx
      .selectFrom("parent_child as pc")
      .innerJoin("unions as u", "u.id", "pc.union_id")
      .select(["u.id as union_id", "u.partner_a_id", "u.partner_b_id", "pc.relation", "pc.birth_order"])
      .where("pc.child_id", "=", id)
      .execute();
    // thứ tự trong nhà (con thứ mấy) và số anh chị em ruột của cặp cha mẹ đó
    const siblingCounts = parentLinks.length
      ? await trx
          .selectFrom("parent_child as pc")
          .innerJoin("persons as c", "c.id", "pc.child_id")
          .select(["pc.union_id", (eb) => eb.fn.countAll<string>().as("n")])
          .where("pc.union_id", "in", parentLinks.map((l) => l.union_id))
          .where("c.deleted_at", "is", null)
          .groupBy("pc.union_id")
          .execute()
      : [];
    const unionIds = unions.map((u) => u.id);
    const childLinks = unionIds.length
      ? await trx
          .selectFrom("parent_child")
          .select(["union_id", "child_id", "relation", "birth_order"])
          .where("union_id", "in", unionIds)
          .orderBy("birth_order")
          .execute()
      : [];
    const ids = new Set<string>();
    for (const l of parentLinks) [l.partner_a_id, l.partner_b_id].forEach((x) => x && ids.add(x));
    for (const u of unions) [u.partner_a_id, u.partner_b_id].forEach((x) => x && x !== id && ids.add(x));
    for (const c of childLinks) ids.add(c.child_id);
    const names = ids.size
      ? await trx
          .selectFrom("persons")
          .select(["id", "full_name", "gender", "birth_year"])
          .where("id", "in", [...ids])
          .where("deleted_at", "is", null)
          .execute()
      : [];
    const brief = new Map(names.map((n) => [n.id, { id: n.id, fullName: n.full_name, gender: n.gender, birthYear: n.birth_year }]));
    return {
      ...toPersonDto(p),
      facts: await this.factsOf(trx, id),
      /** Cha mẹ theo từng cặp: con thứ mấy, ruột/nuôi/riêng */
      childOf: parentLinks.map((l) => ({
        unionId: l.union_id,
        relation: l.relation,
        birthOrder: l.birth_order,
        siblings: Number(siblingCounts.find((c) => c.union_id === l.union_id)?.n ?? 1),
        parents: [l.partner_a_id, l.partner_b_id].filter((x): x is string => !!x && brief.has(x)).map((x) => brief.get(x)!),
      })),
      parents: parentLinks.flatMap((l) =>
        [l.partner_a_id, l.partner_b_id].filter((x): x is string => !!x && brief.has(x)).map((x) => ({ ...brief.get(x)!, relation: l.relation })),
      ),
      unions: unions.map((u) => {
        const partnerId = u.partner_a_id === id ? u.partner_b_id : u.partner_a_id;
        return {
          id: u.id,
          orderIndex: u.order_index,
          /** Người này đứng đầu cặp (thường là chồng) — chỉ khi đó mới xếp được thứ tự vợ cả, vợ hai */
          isPartnerA: u.partner_a_id === id,
          partner: partnerId ? (brief.get(partnerId) ?? null) : null,
          children: childLinks
            .filter((c) => c.union_id === u.id && brief.has(c.child_id))
            .map((c) => ({ ...brief.get(c.child_id)!, relation: c.relation, birthOrder: c.birth_order })),
        };
      }),
    };
  }

  private unionsOf(trx: Tx, personId: string) {
    return trx
      .selectFrom("unions")
      .select(["id", "partner_a_id", "partner_b_id", "order_index"])
      .where((eb) => eb.or([eb("partner_a_id", "=", personId), eb("partner_b_id", "=", personId)]))
      .where("deleted_at", "is", null)
      .orderBy("order_index")
      .execute();
  }

  private auditBase(a: Actor) {
    return { clanId: a.clanId, actorId: a.userId };
  }
}
