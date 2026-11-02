import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootApp, Client, resetDatabase } from "./helpers.js";

// Đăng nhập bằng số điện thoại, tự đăng ký chờ duyệt, quản trị tạo tài khoản (chế độ một dòng họ)
let app: INestApplication;
let owner: Client;
let clanId: string;

const PASSWORD = "matkhau-an-toan";

async function registerPhone(phone: string, name: string) {
  const c = new Client(app);
  const res = await c.agent.post("/api/v1/auth/register").send({ phone, password: PASSWORD, name });
  if (res.status === 201) c.csrf = res.body.csrfToken;
  return { c, res };
}

async function login(identifier: string, password = PASSWORD) {
  const c = new Client(app);
  const res = await c.agent.post("/api/v1/auth/login").send({ identifier, password });
  if (res.status === 200) c.csrf = res.body.csrfToken;
  return { c, res };
}

beforeAll(async () => {
  await resetDatabase();
  app = await bootApp({ CLAN_MODE: "single" });
  owner = new Client(app);
  await owner.register("truongho@example.com", "Trưởng họ");
  clanId = (await owner.post("/clans", { name: "Họ Lê", slug: "ho-le", surname: "Lê" })).body.id;
});
afterAll(async () => {
  await app.close();
});

describe("Đăng ký và đăng nhập bằng số điện thoại", () => {
  it("đăng ký chỉ với số điện thoại, số được chuẩn hoá về +84", async () => {
    const { res } = await registerPhone("0912 345 678", "Lê Văn An");
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ phone: "+84912345678", email: null, name: "Lê Văn An" });
  });

  it("phải có số điện thoại hoặc email", async () => {
    const res = await request(app.getHttpServer()).post("/api/v1/auth/register").send({ password: PASSWORD, name: "Không liên lạc", email: "" });
    expect(res.status).toBe(422);
    expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: "phone", message: "Nhập số điện thoại hoặc email" })]));
  });

  it("số đã có tài khoản (viết kiểu khác) → 409 PHONE_TAKEN, báo đúng ô", async () => {
    const { res } = await registerPhone("+84 912.345.678", "Người khác");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PHONE_TAKEN");
    expect(res.body.details).toEqual([expect.objectContaining({ path: "phone" })]);
  });

  it("đăng nhập bằng số ở cách viết khác; sai mật khẩu báo chung chung", async () => {
    const ok = await login("84912345678");
    expect(ok.res.status).toBe(200);
    expect(ok.res.body.user.phone).toBe("+84912345678");
    const me = await ok.c.get("/me");
    expect(me.body).toMatchObject({ phone: "+84912345678", email: null });

    const bad = await login("0912345678", "sai-mat-khau");
    expect(bad.res.status).toBe(401);
    expect(bad.res.body.message).toBe("Email/số điện thoại hoặc mật khẩu không đúng");

    const invalid = await login("0912");
    expect(invalid.res.status).toBe(422);
    expect(invalid.res.body.details[0]).toMatchObject({ path: "identifier" });
  });

  it("vẫn nhận trường `email` của phiên bản cũ", async () => {
    const res = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: "truongho@example.com", password: PASSWORD });
    expect(res.status).toBe(200);
  });
});

describe("Tự đăng ký → chờ quản lý duyệt", () => {
  let an: Client;
  let requestId: string;

  beforeAll(async () => {
    an = (await login("0912345678")).c;
  });

  it("chưa gửi yêu cầu → null; gửi xong → chờ duyệt, chưa vào được dòng họ", async () => {
    expect((await an.get("/instance/join-request")).body).toEqual({ request: null });
    const res = await an.post("/instance/join-request", { message: "Con ông Tư, chi hai" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "pending", message: "Con ông Tư, chi hai" });
    expect((await an.get(`/clans/${clanId}`)).status).toBe(404);
    expect((await an.get("/me/clans")).body).toEqual([]);
  });

  it("quản trị thấy danh sách chờ duyệt kèm số điện thoại và lời nhắn", async () => {
    const res = await owner.get(`/clans/${clanId}/join-requests`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ name: "Lê Văn An", phone: "+84912345678", message: "Con ông Tư, chi hai" })]);
    requestId = res.body[0].id;
  });

  it("duyệt với vai trò người nhập liệu → vào được dòng họ; duyệt lần hai báo đã xử lý", async () => {
    const res = await owner.post(`/clans/${clanId}/join-requests/${requestId}/approve`, { role: "editor" });
    expect(res.status).toBe(204);
    const clans = await an.get("/me/clans");
    expect(clans.body).toEqual([expect.objectContaining({ id: clanId, role: "editor" })]);
    expect((await an.get("/instance/join-request")).body.request.status).toBe("approved");
    expect((await owner.get(`/clans/${clanId}/join-requests`)).body).toEqual([]);

    const again = await owner.post(`/clans/${clanId}/join-requests/${requestId}/approve`, { role: "member" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("REQUEST_DECIDED");
  });

  it("đã là thành viên thì không gửi yêu cầu nữa", async () => {
    const res = await an.post("/instance/join-request", {});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALREADY_MEMBER");
  });

  it("người nhập liệu không xem/duyệt được yêu cầu", async () => {
    expect((await an.get(`/clans/${clanId}/join-requests`)).status).toBe(403);
  });

  it("từ chối → báo bị từ chối; gửi lại thì chờ duyệt lại", async () => {
    const { c: binh } = await registerPhone("0987654321", "Lê Thị Bình");
    await binh.post("/instance/join-request", {});
    const id = (await owner.get(`/clans/${clanId}/join-requests`)).body[0].id;
    expect((await owner.post(`/clans/${clanId}/join-requests/${id}/reject`)).status).toBe(204);
    expect((await binh.get("/instance/join-request")).body.request.status).toBe("rejected");
    expect((await binh.get(`/clans/${clanId}`)).status).toBe(404);

    const again = await binh.post("/instance/join-request", { message: "Cháu nội cụ Lê Văn Tổ" });
    expect(again.body.status).toBe("pending");
    expect((await owner.get(`/clans/${clanId}/join-requests`)).body).toHaveLength(1);
  });
});

describe("Quản trị tạo tài khoản cho người mới", () => {
  let setPasswordPath: string;

  it("tạo tài khoản bằng số điện thoại, chọn vai trò; trả link đặt mật khẩu 7 ngày", async () => {
    const res = await owner.post(`/clans/${clanId}/members`, { name: "Lê Văn Cụ", phone: "0905 111 222", email: "", role: "member" });
    expect(res.status).toBe(201);
    expect(res.body.member).toMatchObject({ name: "Lê Văn Cụ", phone: "+84905111222", email: null, role: "member", passwordPending: true });
    expect(res.body.setPassword.path).toMatch(/^\/dat-lai-mat-khau\?ma=[A-Za-z0-9_-]{43}$/);
    const days = (new Date(res.body.setPassword.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    setPasswordPath = res.body.setPassword.path;
  });

  it("chưa đặt mật khẩu thì chưa đăng nhập được; đặt xong thì vào được với đúng vai trò", async () => {
    expect((await login("0905111222")).res.status).toBe(401);
    const token = setPasswordPath.split("ma=")[1];
    const reset = await request(app.getHttpServer()).post("/api/v1/auth/reset-password").send({ token, password: "mat-khau-cua-cu" });
    expect(reset.status).toBe(200);

    const { c, res } = await login("0905111222", "mat-khau-cua-cu");
    expect(res.status).toBe(200);
    expect((await c.get("/me/clans")).body).toEqual([expect.objectContaining({ id: clanId, role: "member" })]);
    const members = (await owner.get(`/clans/${clanId}/members`)).body as Array<{ phone: string; passwordPending: boolean }>;
    expect(members.find((m) => m.phone === "+84905111222")?.passwordPending).toBe(false);
  });

  it("không gắn tài khoản đã có sẵn (số/email đã đăng ký) — tránh chiếm tài khoản người khác", async () => {
    const byPhone = await owner.post(`/clans/${clanId}/members`, { name: "Trùng", phone: "0987654321", role: "member" });
    expect(byPhone.status).toBe(409);
    expect(byPhone.body.code).toBe("PHONE_TAKEN");
    const byEmail = await owner.post(`/clans/${clanId}/members`, { name: "Trùng", email: "truongho@example.com", role: "member" });
    expect(byEmail.body.code).toBe("EMAIL_TAKEN");
  });

  it("phải có số điện thoại hoặc email", async () => {
    const res = await owner.post(`/clans/${clanId}/members`, { name: "Không liên lạc", role: "member" });
    expect(res.status).toBe(422);
  });

  it("người nhập liệu không tạo được tài khoản", async () => {
    const editor = (await login("0912345678")).c;
    expect((await editor.post(`/clans/${clanId}/members`, { name: "X", phone: "0905333444" })).status).toBe(403);
  });
});

describe("Link mời khi đang đăng nhập bằng tài khoản quản trị", () => {
  it("xem trước có clanId; người đã là thành viên bấm nhận thì giữ vai trò cũ, không tốn lượt", async () => {
    const inv = await owner.post(`/clans/${clanId}/invitations`, { role: "member" });
    const preview = await request(app.getHttpServer()).get(`/api/v1/invitations/${inv.body.token}`);
    expect(preview.body.clanId).toBe(clanId);

    const res = await owner.post(`/invitations/${inv.body.token}/accept`);
    expect(res.body).toEqual({ clanId, alreadyMember: true, role: "owner" });
    const list = (await owner.get(`/clans/${clanId}/invitations`)).body as Array<{ id: string; useCount: number }>;
    expect(list.find((i) => i.id === inv.body.id)?.useCount).toBe(0);
  });

  it("người mới nhận link vai trò thành viên → đúng vai trò thành viên, yêu cầu chờ duyệt (nếu có) được đóng", async () => {
    const inv = await owner.post(`/clans/${clanId}/invitations`, { role: "member" });
    const { c: binh } = await login("0987654321");
    const res = await binh.post(`/invitations/${inv.body.token}/accept`);
    expect(res.body).toMatchObject({ alreadyMember: false, role: "member" });
    expect((await binh.get("/me/clans")).body[0].role).toBe("member");
    expect((await binh.get(`/clans/${clanId}/members`)).status).toBe(403);
    expect((await owner.get(`/clans/${clanId}/join-requests`)).body).toEqual([]);
  });
});
