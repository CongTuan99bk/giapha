import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootApp, Client, resetDatabase } from "./helpers.js";

let app: INestApplication;
let owner: Client;
let clanId: string;
let rootId: string;
const users: Record<string, Client> = {};
const memberIds: Record<string, string> = {};

const tokenOf = (res: { body: { token: string } }) => res.body.token;

async function join(name: string, token: string) {
  const c = new Client(app);
  await c.register(`${name}@example.com`, name);
  const res = await c.post(`/invitations/${token}/accept`);
  users[name] = c;
  return res;
}

beforeAll(async () => {
  await resetDatabase();
  app = await bootApp();
  owner = new Client(app);
  await owner.register("owner@example.com", "Chủ họ");
  clanId = (await owner.post("/clans", { name: "Họ Võ", slug: "ho-vo", surname: "Võ" })).body.id;
  rootId = (await owner.post(`/clans/${clanId}/persons`, { fullName: "Võ Văn Tổ", gender: "male", isLiving: false })).body.id;
});
afterAll(async () => {
  await app.close();
});

describe("Lời mời", () => {
  let editorToken: string;

  it("chủ sở hữu tạo lời mời vai trò người nhập liệu; mã chỉ trả về một lần", async () => {
    const res = await owner.post(`/clans/${clanId}/invitations`, { role: "editor", maxUses: 2 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ role: "editor", maxUses: 2, useCount: 0, status: "active" });
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    editorToken = tokenOf(res);

    const list = await owner.get(`/clans/${clanId}/invitations`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].token).toBeUndefined();
  });

  it("ai có link cũng xem trước được (không cần đăng nhập), không lộ email", async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/invitations/${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({ clanName: "Họ Võ", role: "editor", invitedBy: "Chủ họ", status: "active", forSpecificEmail: false }),
    );
    const bad = await request(app.getHttpServer()).get("/api/v1/invitations/khong-co-ma-nay-dau-nhe");
    expect(bad.status).toBe(404);
    expect(bad.body.code).toBe("INVITE_NOT_FOUND");
  });

  it("nhận lời mời → vào dòng họ với đúng vai trò, nhận lại lần nữa không tốn lượt", async () => {
    const res = await join("bien-tap", editorToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ clanId, alreadyMember: false, role: "editor" });

    const again = await users["bien-tap"]!.post(`/invitations/${editorToken}/accept`);
    expect(again.body).toEqual({ clanId, alreadyMember: true, role: "editor" });

    const clan = await users["bien-tap"]!.get(`/clans/${clanId}`);
    expect(clan.body.role).toBe("editor");
    const inv = await owner.get(`/clans/${clanId}/invitations`);
    expect(inv.body[0].useCount).toBe(1);
  });

  it("hết lượt → 410 INVITE_USED", async () => {
    expect((await join("nguoi-2", editorToken)).status).toBe(200);
    const res = await join("nguoi-3", editorToken);
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("INVITE_USED");
  });

  it("huỷ lời mời → 410 INVITE_REVOKED", async () => {
    const created = await owner.post(`/clans/${clanId}/invitations`, {});
    expect((await owner.delete(`/clans/${clanId}/invitations/${created.body.id}`)).status).toBe(204);
    const res = await join("nguoi-4", tokenOf(created));
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("INVITE_REVOKED");
  });

  it("lời mời theo email: tài khoản khác email bị từ chối", async () => {
    const created = await owner.post(`/clans/${clanId}/invitations`, { email: "Dung@Example.com" });
    const wrong = await join("sai-email", tokenOf(created));
    expect(wrong.status).toBe(403);
    expect(wrong.body.code).toBe("INVITE_EMAIL_MISMATCH");
    const right = await join("dung", tokenOf(created)); // dung@example.com — so khớp không phân biệt hoa thường
    expect(right.status).toBe(200);
  });

  it("lời mời gắn sẵn người trong phả ('Đây là tôi'); một người chỉ gắn một tài khoản", async () => {
    const created = await owner.post(`/clans/${clanId}/invitations`, { personId: rootId });
    expect(created.body.person).toEqual({ id: rootId, fullName: "Võ Văn Tổ" });
    expect((await join("con-chau", tokenOf(created))).status).toBe(200);
    const members = await owner.get(`/clans/${clanId}/members`);
    const m = members.body.find((x: { email: string }) => x.email === "con-chau@example.com");
    expect(m.person).toEqual({ id: rootId, fullName: "Võ Văn Tổ" });
    memberIds["con-chau"] = m.id;

    const dup = await owner.post(`/clans/${clanId}/invitations`, { personId: rootId });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("PERSON_ALREADY_LINKED");
  });
});

describe("Phân quyền", () => {
  it("người nhập liệu sửa phả được nhưng không quản lý thành viên/lời mời", async () => {
    const ed = users["bien-tap"]!;
    expect((await ed.post(`/clans/${clanId}/persons/${rootId}/children`, { person: { fullName: "Võ Văn Con", gender: "male" } })).status).toBe(201);
    expect((await ed.get(`/clans/${clanId}/members`)).status).toBe(403);
    expect((await ed.post(`/clans/${clanId}/invitations`, {})).status).toBe(403);
  });

  it("thành viên thường chỉ xem, không sửa phả", async () => {
    const mem = users["dung"]!;
    expect((await mem.get(`/clans/${clanId}/tree`)).status).toBe(200);
    expect((await mem.post(`/clans/${clanId}/persons`, { fullName: "Lạ", gender: "male" })).status).toBe(403);
  });

  it("chỉ chủ sở hữu mới cấp được quyền quản trị", async () => {
    const created = await owner.post(`/clans/${clanId}/invitations`, { role: "admin" });
    expect(created.status).toBe(201);
    expect((await join("quan-tri", tokenOf(created))).status).toBe(200);
    const admin = users["quan-tri"]!;

    const tryAdmin = await admin.post(`/clans/${clanId}/invitations`, { role: "admin" });
    expect(tryAdmin.status).toBe(403);
    expect(tryAdmin.body.code).toBe("ROLE_TOO_LOW");
    expect((await admin.post(`/clans/${clanId}/invitations`, { role: "editor" })).status).toBe(201);
    expect((await admin.post(`/clans/${clanId}/invitations`, { role: "owner" })).status).toBe(422);
  });

  it("đổi vai trò: không đụng tới chủ sở hữu, không tự đổi mình, chỉ người thấp hơn", async () => {
    const admin = users["quan-tri"]!;
    const members = (await owner.get(`/clans/${clanId}/members`)).body as Array<{ id: string; email: string; role: string }>;
    const id = (email: string) => members.find((m) => m.email === email)!.id;
    expect(members[0]).toMatchObject({ email: "owner@example.com", role: "owner" }); // chủ sở hữu đứng đầu

    expect((await admin.patch(`/clans/${clanId}/members/${id("owner@example.com")}`, { role: "member" })).status).toBe(403);
    expect((await admin.patch(`/clans/${clanId}/members/${id("quan-tri@example.com")}`, { role: "member" })).body.code).toBe("CANNOT_CHANGE_OWN_ROLE");
    const demote = await admin.patch(`/clans/${clanId}/members/${id("bien-tap@example.com")}`, { role: "member" });
    expect(demote.status).toBe(200);
    expect(demote.body.role).toBe("member");
    // quyền mới có hiệu lực ngay
    const ed = users["bien-tap"]!;
    expect((await ed.post(`/clans/${clanId}/persons`, { fullName: "Thử", gender: "male" })).status).toBe(403);
  });

  it("xoá thành viên → người đó không còn vào được dòng họ", async () => {
    const res = await owner.delete(`/clans/${clanId}/members/${memberIds["con-chau"]}`);
    expect(res.status).toBe(204);
    expect((await users["con-chau"]!.get(`/clans/${clanId}`)).status).toBe(404);
    const self = (await owner.get(`/clans/${clanId}/members`)).body.find((m: { role: string }) => m.role === "owner");
    expect((await owner.delete(`/clans/${clanId}/members/${self.id}`)).body.code).toBe("CANNOT_REMOVE_SELF");
  });

  it("'Đây là tôi': thành viên tự gắn mình với một người trong phả", async () => {
    const mem = users["dung"]!;
    const res = await mem.patch(`/clans/${clanId}/me/person`, { personId: rootId });
    expect(res.status).toBe(200);
    expect(res.body.person).toEqual({ id: rootId, fullName: "Võ Văn Tổ" });
    expect((await mem.get(`/clans/${clanId}`)).body.myPersonId).toBe(rootId);
  });
});
