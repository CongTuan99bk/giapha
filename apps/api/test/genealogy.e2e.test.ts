import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootApp, Client, resetDatabase } from "./helpers.js";

let app: INestApplication;
let owner: Client;
let outsider: Client;
let clanId: string;
const ids: Record<string, string> = {};

const male = (fullName: string, extra: object = {}) => ({ fullName, gender: "male", ...extra });
const female = (fullName: string, extra: object = {}) => ({ fullName, gender: "female", ...extra });

beforeAll(async () => {
  await resetDatabase();
  app = await bootApp();
  owner = new Client(app);
  await owner.register("truong-toc@example.com", "Trưởng tộc");
  outsider = new Client(app);
  await outsider.register("nguoi-ngoai@example.com", "Người ngoài");
});
afterAll(async () => {
  await app.close();
});

describe("Dòng họ", () => {
  it("tạo dòng họ → người tạo là owner", async () => {
    const res = await owner.post("/clans", { name: "Họ Nguyễn Đức", slug: "nguyen-duc", surname: "Nguyễn" });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("owner");
    clanId = res.body.id;

    const mine = await owner.get("/me/clans");
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({ id: clanId, role: "owner", lineageMode: "patrilineal", kinshipVariant: "trung" });
  });

  it("slug trùng → 409 SLUG_TAKEN", async () => {
    const res = await outsider.post("/clans", { name: "Khác", slug: "nguyen-duc", surname: "Nguyễn" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SLUG_TAKEN");
  });

  it("người ngoài không thấy dòng họ (404, không lộ sự tồn tại)", async () => {
    expect((await outsider.get(`/clans/${clanId}`)).status).toBe(404);
    expect((await outsider.get(`/clans/${clanId}/persons`)).status).toBe(404);
    expect((await outsider.post(`/clans/${clanId}/persons`, male("Kẻ lạ"))).status).toBe(404);
  });
});

describe("Xây phả đồ", () => {
  it("người đầu tiên thành thuỷ tổ, đời 1", async () => {
    const res = await owner.post(`/clans/${clanId}/persons`, male("Nguyễn Đức Tổ", { isLiving: false }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ generation: 1, inClan: true, privacy: "public" });
    ids.to = res.body.id;
    const clan = await owner.get(`/clans/${clanId}`);
    expect(clan.body.rootPersonId).toBe(ids.to);
  });

  it("thêm vợ, rồi con (tự gắn vào cặp vợ chồng duy nhất)", async () => {
    const wife = await owner.post(`/clans/${clanId}/persons/${ids.to}/spouses`, { person: female("Trần Thị Bà", { isLiving: false }) });
    expect(wife.status).toBe(201);
    ids.ba = wife.body.person.id;
    ids.union = wife.body.unionId;
    expect(wife.body.person).toMatchObject({ inClan: false, generation: 1 });

    const son = await owner.post(`/clans/${clanId}/persons/${ids.to}/children`, { person: male("Nguyễn Đức Trưởng") });
    expect(son.status).toBe(201);
    expect(son.body.unionId).toBe(ids.union);
    expect(son.body.person).toMatchObject({ generation: 2, inClan: true, privacy: "members" });
    ids.truong = son.body.person.id;

    const daughter = await owner.post(`/clans/${clanId}/persons/${ids.ba}/children`, { person: female("Nguyễn Thị Gái") });
    expect(daughter.body.unionId).toBe(ids.union);
    ids.gai = daughter.body.person.id;

    const second = await owner.post(`/clans/${clanId}/persons/${ids.to}/children`, { person: male("Nguyễn Đức Thứ") });
    ids.thu = second.body.person.id;
  });

  it("đời 3 và cháu ngoại không thuộc họ (theo phụ hệ)", async () => {
    const grandson = await owner.post(`/clans/${clanId}/persons/${ids.truong}/children`, { person: male("Nguyễn Đức Cháu") });
    expect(grandson.body.person).toMatchObject({ generation: 3, inClan: true });
    ids.chau = grandson.body.person.id;

    const nephew = await owner.post(`/clans/${clanId}/persons/${ids.thu}/children`, { person: male("Nguyễn Đức Họ") });
    ids.chuHo = nephew.body.person.id;

    const outside = await owner.post(`/clans/${clanId}/persons/${ids.gai}/children`, { person: male("Lê Văn Ngoại") });
    expect(outside.body.person).toMatchObject({ generation: 3, inClan: false });
    ids.ngoai = outside.body.person.id;
  });

  it("chi tiết người: cha mẹ, vợ chồng, con theo thứ tự", async () => {
    const res = await owner.get(`/clans/${clanId}/persons/${ids.to}`);
    expect(res.status).toBe(200);
    const union = res.body.unions[0];
    expect(union.partner.id).toBe(ids.ba);
    expect(union.children.map((c: { id: string }) => c.id)).toEqual([ids.truong, ids.gai, ids.thu]);
  });

  it("sắp lại thứ tự con", async () => {
    const res = await owner.put(`/clans/${clanId}/unions/${ids.union}/children/order`, {
      childIds: [ids.thu, ids.truong, ids.gai],
    });
    expect(res.status).toBe(204);
    const detail = await owner.get(`/clans/${clanId}/persons/${ids.to}`);
    expect(detail.body.unions[0].children.map((c: { id: string }) => c.id)).toEqual([ids.thu, ids.truong, ids.gai]);
    // trả lại thứ tự cũ cho các test sau
    await owner.put(`/clans/${clanId}/unions/${ids.union}/children/order`, { childIds: [ids.truong, ids.gai, ids.thu] });
  });

  it("danh sách con không khớp → 422", async () => {
    const res = await owner.put(`/clans/${clanId}/unions/${ids.union}/children/order`, { childIds: [ids.truong] });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("CHILD_LIST_MISMATCH");
  });

  it("tìm kiếm không dấu", async () => {
    const res = await owner.get(`/clans/${clanId}/persons?q=duc truong`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((p: { id: string }) => p.id)).toEqual([ids.truong]);
    const to = await owner.get(`/clans/${clanId}/persons?q=duc to`);
    expect(to.body.items[0]).toMatchObject({ fullName: "Nguyễn Đức Tổ", deathYear: null, isLiving: false });
    const byGen = await owner.get(`/clans/${clanId}/persons?generation=3`);
    expect(byGen.body.items).toHaveLength(3);
  });

  it("thêm cha cho thuỷ tổ → thuỷ tổ dời lên, đời tính lại", async () => {
    const res = await owner.post(`/clans/${clanId}/persons/${ids.to}/parents`, { person: male("Nguyễn Đức Cao Tổ", { isLiving: false }) });
    expect(res.status).toBe(201);
    ids.caoTo = res.body.person.id;
    expect(res.body.person.generation).toBe(1);
    const clan = await owner.get(`/clans/${clanId}`);
    expect(clan.body.rootPersonId).toBe(ids.caoTo);
    const chau = await owner.get(`/clans/${clanId}/persons/${ids.chau}`);
    expect(chau.body.generation).toBe(4);
  });

  it("đã có cha mẹ → không thêm cha mẹ lần nữa (409)", async () => {
    const res = await owner.post(`/clans/${clanId}/persons/${ids.to}/parents`, { person: male("Người khác") });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("HAS_PARENTS");
  });
});

describe("Toàn vẹn dữ liệu", () => {
  it("sửa với version cũ → 409 PERSON_VERSION_CONFLICT", async () => {
    const p = await owner.get(`/clans/${clanId}/persons/${ids.chau}`);
    const v = p.body.version;
    const ok = await owner.patch(`/clans/${clanId}/persons/${ids.chau}`, { fullName: "Nguyễn Đức Cháu Đích", version: v });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(v + 1);
    const stale = await owner.patch(`/clans/${clanId}/persons/${ids.chau}`, { fullName: "Ghi đè", version: v });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("PERSON_VERSION_CONFLICT");
  });

  it("người còn sống không được có ngày mất", async () => {
    const p = await owner.get(`/clans/${clanId}/persons/${ids.chau}`);
    const res = await owner.patch(`/clans/${clanId}/persons/${ids.chau}`, {
      deathDate: { calendar: "solar", precision: "year", year: 2020 },
      version: p.body.version,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("LIVING_WITH_DEATH_DATE");
  });

  it("ngày giỗ âm lịch tính từ ngày mất dương lịch", async () => {
    const p = await owner.get(`/clans/${clanId}/persons/${ids.caoTo}`);
    const res = await owner.patch(`/clans/${clanId}/persons/${ids.caoTo}`, {
      deathDate: { calendar: "solar", precision: "day", year: 2024, month: 2, day: 10 }, // Mùng 1 Tết Giáp Thìn
      version: p.body.version,
    });
    expect(res.status).toBe(200);
    expect(res.body.deathAnniversaryLunar).toEqual({ day: 1, month: 1, isLeapMonth: false });
  });

  it("không kết hôn với chính mình / không thêm trùng vợ chồng", async () => {
    const self = await owner.post(`/clans/${clanId}/persons/${ids.chau}/spouses`, { existingPersonId: ids.chau });
    expect(self.status).toBe(422);
    expect(self.body.code).toBe("SELF_UNION");
    const dup = await owner.post(`/clans/${clanId}/persons/${ids.to}/spouses`, { existingPersonId: ids.ba });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("ALREADY_SPOUSES");
    // Vòng tổ tiên không tạo được qua API (thêm cha mẹ chỉ cho người chưa có cha mẹ, thêm con luôn tạo người mới);
    // lớp CSDL vẫn chặn bằng trigger — xem packages/db/test/rls.test.ts.
  });

  it("xoá người có con cháu cần xác nhận", async () => {
    const res = await owner.delete(`/clans/${clanId}/persons/${ids.thu}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("HAS_DESCENDANTS");
    const confirmed = await owner.delete(`/clans/${clanId}/persons/${ids.chuHo}?confirm=true`);
    expect(confirmed.status).toBe(204);
    expect((await owner.get(`/clans/${clanId}/persons/${ids.chuHo}`)).status).toBe(404);
  });

  it("không xoá được thuỷ tổ", async () => {
    const res = await owner.delete(`/clans/${clanId}/persons/${ids.caoTo}?confirm=true`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("IS_ROOT_PERSON");
  });
});

describe("Phả đồ và xưng hô", () => {
  it("GET tree trả về bố cục đủ người, có toạ độ", async () => {
    const res = await owner.get(`/clans/${clanId}/tree`);
    expect(res.status).toBe(200);
    expect(res.body.rootId).toBe(ids.caoTo);
    const nodeIds = res.body.nodes.map((n: { personId: string }) => n.personId);
    for (const key of ["caoTo", "to", "ba", "truong", "gai", "thu", "chau", "ngoai"]) {
      expect(nodeIds).toContain(ids[key]);
    }
    expect(nodeIds).not.toContain(ids.chuHo); // đã xoá
    const root = res.body.nodes.find((n: { personId: string }) => n.personId === ids.caoTo);
    expect(root.person).toMatchObject({ fullName: "Nguyễn Đức Cao Tổ", generation: 1 });
    expect(res.body.width).toBeGreaterThan(0);
    expect(res.body.edges.length).toBeGreaterThan(0);
  });

  it("giới hạn độ sâu", async () => {
    const res = await owner.get(`/clans/${clanId}/tree?depth=2`);
    const depths = res.body.nodes.map((n: { depth: number }) => n.depth);
    expect(Math.max(...depths)).toBeLessThanOrEqual(1);
  });

  it("xưng hô hai chiều: cháu nội ↔ ông nội", async () => {
    const res = await owner.get(`/clans/${clanId}/kinship?a=${ids.chau}&b=${ids.to}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ related: true, aCallsB: "ông nội", bCallsA: "cháu nội" });
  });

  it("xưng hô bên ngoại (mặc định miền Trung): anh của mẹ là bác, em trai của mẹ là cậu", async () => {
    const elder = await owner.get(`/clans/${clanId}/kinship?a=${ids.ngoai}&b=${ids.truong}`);
    expect(elder.body.aCallsB).toBe("bác");
    const younger = await owner.get(`/clans/${clanId}/kinship?a=${ids.ngoai}&b=${ids.thu}`);
    expect(younger.body.aCallsB).toBe("cậu");
  });

  it("người ngoài không xem được phả đồ", async () => {
    expect((await outsider.get(`/clans/${clanId}/tree`)).status).toBe(404);
  });
});

describe("Cài đặt dòng họ", () => {
  it("đổi thuỷ tổ → đời được tính lại", async () => {
    const p = await owner.patch(`/clans/${clanId}`, { rootPersonId: ids.to });
    expect(p.status).toBe(200);
    expect(p.body.rootPersonId).toBe(ids.to);
    const chau = await owner.get(`/clans/${clanId}/persons/${ids.chau}`);
    expect(chau.body.generation).toBe(3);
    await owner.patch(`/clans/${clanId}`, { rootPersonId: ids.caoTo });
  });

  it("thuỷ tổ không tồn tại → 422", async () => {
    const res = await owner.patch(`/clans/${clanId}`, { rootPersonId: "00000000-0000-4000-8000-000000000000" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ROOT_NOT_FOUND");
  });
});
