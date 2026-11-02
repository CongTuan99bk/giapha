import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootApp, Client, resetDatabase } from "./helpers.js";

// Hoàn thiện nhập phả: tên khác, quê quán/nghề/nơi an táng, tiểu sử, đổi cha mẹ, con nuôi/riêng, vợ cả/vợ hai, gỡ hôn phối
let app: INestApplication;
let owner: Client;
let member: Client;
let clanId: string;
const id: Record<string, string> = {};

const url = (path: string) => `/clans/${clanId}${path}`;

beforeAll(async () => {
  await resetDatabase();
  app = await bootApp();
  owner = new Client(app);
  await owner.register("chu@example.com", "Chủ họ");
  clanId = (await owner.post("/clans", { name: "Họ Trần", slug: "ho-tran", surname: "Trần" })).body.id;

  id.to = (await owner.post(url("/persons"), { fullName: "Trần Văn Tổ", gender: "male", isLiving: false })).body.id;
  // hai vợ: bà cả, bà hai
  id.baCa = (await owner.post(url(`/persons/${id.to}/spouses`), { person: { fullName: "Lê Thị Cả", gender: "female", isLiving: false } })).body.person.id;
  id.baHai = (await owner.post(url(`/persons/${id.to}/spouses`), { person: { fullName: "Võ Thị Hai", gender: "female", isLiving: false } })).body.person.id;
  const detail = (await owner.get(url(`/persons/${id.to}`))).body;
  id.unionCa = detail.unions[0].id;
  id.unionHai = detail.unions[1].id;
  // ba con với bà cả
  for (const name of ["Trần Văn Một", "Trần Văn Hai", "Trần Thị Ba"]) {
    const res = await owner.post(url(`/persons/${id.to}/children`), { unionId: id.unionCa, person: { fullName: name, gender: name.includes("Thị") ? "female" : "male" } });
    id[name] = res.body.person.id;
  }

  const inv = await owner.post(url("/invitations"), { role: "member" });
  member = new Client(app);
  await member.register("tv@example.com", "Thành viên");
  await member.post(`/invitations/${inv.body.token}/accept`);
});
afterAll(async () => {
  await app.close();
});

describe("Hồ sơ đầy đủ", () => {
  it("lưu tên huý/tự/thuỵ, quê quán, nghề nghiệp, nơi an táng, tiểu sử (giữ xuống dòng)", async () => {
    const before = (await owner.get(url(`/persons/${id.to}`))).body;
    const res = await owner.patch(url(`/persons/${id.to}`), {
      version: before.version,
      otherNames: [
        { type: "huy", value: "Trần Công Tổ" },
        { type: "thuy", value: "Phúc Đức" },
        { type: "khac", value: "ông Cả Tổ" },
      ],
      facts: { birthPlace: "Làng Vân, huyện Hoài Nhơn", burialPlace: "Nghĩa trang họ Trần, đồi Cát", occupation: "Lý trưởng" },
      biography: { text: "Ông mở đất lập làng.\nCó công dựng nhà thờ họ." },
    });
    expect(res.status).toBe(200);
    const d = (await member.get(url(`/persons/${id.to}`))).body;
    expect(d.otherNames).toHaveLength(3);
    expect(d.facts).toEqual({ birthPlace: "Làng Vân, huyện Hoài Nhơn", burialPlace: "Nghĩa trang họ Trần, đồi Cát", occupation: "Lý trưởng" });
    expect(d.biography).toEqual({ text: "Ông mở đất lập làng.\nCó công dựng nhà thờ họ." });
  });

  it("chỉ gửi một trường thì các trường khác giữ nguyên; null hoặc rỗng thì xoá; tiểu sử rỗng → null", async () => {
    const v = (await owner.get(url(`/persons/${id.to}`))).body.version;
    await owner.patch(url(`/persons/${id.to}`), { version: v, facts: { occupation: "" }, biography: { text: "  " } });
    const d = (await owner.get(url(`/persons/${id.to}`))).body;
    expect(d.facts).toEqual({ birthPlace: "Làng Vân, huyện Hoài Nhơn", burialPlace: "Nghĩa trang họ Trần, đồi Cát" });
    expect(d.biography).toBeNull();
  });

  it("tạo người kèm thông tin thêm; trường lạ bị từ chối", async () => {
    const ok = await owner.post(url(`/persons/${id["Trần Văn Một"]}/children`), {
      person: { fullName: "Trần Văn Cháu", gender: "male", facts: { occupation: "Giáo viên" } },
    });
    expect(ok.status).toBe(201);
    id.chau = ok.body.person.id;
    expect((await owner.get(url(`/persons/${id.chau}`))).body.facts).toEqual({ occupation: "Giáo viên" });
    const bad = await owner.post(url("/persons"), { fullName: "X", facts: { soThich: "câu cá" } });
    expect(bad.status).toBe(422);
  });
});

describe("Con thứ mấy, con nuôi, con riêng", () => {
  it("chi tiết người con cho biết con thứ mấy trên tổng số và ruột/nuôi", async () => {
    const d = (await owner.get(url(`/persons/${id["Trần Văn Hai"]}`))).body;
    expect(d.childOf).toEqual([expect.objectContaining({ unionId: id.unionCa, relation: "biological", birthOrder: 2, siblings: 3 })]);
    expect(d.childOf[0].parents.map((p: { fullName: string }) => p.fullName)).toEqual(["Trần Văn Tổ", "Lê Thị Cả"]);
  });

  it("đổi thành con nuôi của cùng cặp: thứ tự giữ nguyên", async () => {
    const res = await owner.put(url(`/persons/${id["Trần Thị Ba"]}/parent-link`), { parentId: id.to, unionId: id.unionCa, relation: "adopted" });
    expect(res.status).toBe(200);
    expect(res.body.childOf).toEqual([expect.objectContaining({ relation: "adopted", birthOrder: 3 })]);
  });

  it("nhập nhầm mẹ → chuyển sang bà hai: anh chị em ở cặp cũ được đánh số lại 1, 2", async () => {
    const res = await owner.put(url(`/persons/${id["Trần Văn Một"]}/parent-link`), { parentId: id.to, unionId: id.unionHai });
    expect(res.status).toBe(200);
    expect(res.body.childOf).toEqual([expect.objectContaining({ unionId: id.unionHai, birthOrder: 1, siblings: 1 })]);
    const to = (await owner.get(url(`/persons/${id.to}`))).body;
    const ca = to.unions.find((u: { id: string }) => u.id === id.unionCa);
    expect(ca.children.map((c: { fullName: string; birthOrder: number }) => [c.fullName, c.birthOrder])).toEqual([
      ["Trần Văn Hai", 1],
      ["Trần Thị Ba", 2],
    ]);
    // con cháu đi theo: cháu vẫn là đời 3
    expect((await owner.get(url(`/persons/${id.chau}`))).body.generation).toBe(3);
  });

  it("cha có hai vợ mà không chọn cặp → UNION_REQUIRED kèm danh sách", async () => {
    const res = await owner.put(url(`/persons/${id["Trần Văn Hai"]}/parent-link`), { parentId: id.to });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("UNION_REQUIRED");
    expect(res.body.details.unions).toHaveLength(2);
  });

  it("gắn người chưa có cha mẹ (nhập rời) vào cây; cha chỉ có một cặp thì tự chọn", async () => {
    const lone = (await owner.post(url("/persons"), { fullName: "Trần Văn Lạc", gender: "male" })).body.id;
    expect((await owner.get(url(`/persons/${lone}`))).body.generation).toBeNull();
    const res = await owner.put(url(`/persons/${lone}/parent-link`), { parentId: id["Trần Văn Hai"] });
    expect(res.status).toBe(200);
    expect(res.body.generation).toBe(3);
  });

  it("con riêng: thêm bên cạnh cha mẹ ruột, không thay", async () => {
    const res = await owner.put(url(`/persons/${id["Trần Văn Hai"]}/parent-link`), { parentId: id.baHai, relation: "step" });
    expect(res.status).toBe(200);
    expect(res.body.childOf.map((c: { relation: string }) => c.relation).sort()).toEqual(["biological", "step"]);
  });

  it("không tạo vòng lặp tổ tiên, không tự làm cha mình, không đổi cha mẹ của thuỷ tổ", async () => {
    const cycle = await owner.put(url(`/persons/${id["Trần Văn Một"]}/parent-link`), { parentId: id.chau });
    expect(cycle.status).toBe(422);
    expect(cycle.body.code).toBe("ANCESTOR_CYCLE");
    expect((await owner.put(url(`/persons/${id.chau}/parent-link`), { parentId: id.chau })).body.code).toBe("SELF_PARENT");
    expect((await owner.put(url(`/persons/${id.to}/parent-link`), { parentId: id.chau })).body.code).toBe("IS_ROOT_PERSON");
  });

  it("thành viên thường không sửa được", async () => {
    expect((await member.put(url(`/persons/${id.chau}/parent-link`), { parentId: id.to })).status).toBe(403);
  });
});

describe("Vợ cả, vợ hai; gỡ quan hệ vợ chồng", () => {
  it("đổi thứ tự vợ: bà hai lên trước", async () => {
    const res = await owner.put(url(`/persons/${id.to}/unions/order`), { unionIds: [id.unionHai, id.unionCa] });
    expect(res.status).toBe(204);
    const d = (await owner.get(url(`/persons/${id.to}`))).body;
    expect(d.unions.map((u: { partner: { fullName: string }; orderIndex: number; isPartnerA: boolean }) => [u.partner.fullName, u.orderIndex, u.isPartnerA])).toEqual([
      ["Võ Thị Hai", 1, true],
      ["Lê Thị Cả", 2, true],
    ]);
    const bad = await owner.put(url(`/persons/${id.to}/unions/order`), { unionIds: [id.unionHai] });
    expect(bad.body.code).toBe("UNION_LIST_MISMATCH");
  });

  it("không gỡ được cặp có con chung; gỡ được cặp nhập nhầm, người kia vẫn còn", async () => {
    const busy = await owner.delete(url(`/unions/${id.unionCa}`));
    expect(busy.status).toBe(409);
    expect(busy.body.code).toBe("UNION_HAS_CHILDREN");

    const wrong = (await owner.post(url(`/persons/${id.to}/spouses`), { person: { fullName: "Nhập Nhầm", gender: "female" } })).body;
    expect((await owner.delete(url(`/unions/${wrong.unionId}`))).status).toBe(204);
    const d = (await owner.get(url(`/persons/${id.to}`))).body;
    expect(d.unions.map((u: { orderIndex: number }) => u.orderIndex)).toEqual([1, 2]);
    expect((await owner.get(url(`/persons/${wrong.person.id}`))).status).toBe(200);
    // nối lại đúng hai người đó vẫn được (không vướng bản ghi cũ)
    expect((await owner.post(url(`/persons/${id.to}/spouses`), { existingPersonId: wrong.person.id })).status).toBe(201);
  });
});
