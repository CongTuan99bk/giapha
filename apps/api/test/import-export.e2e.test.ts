import type { INestApplication } from "@nestjs/common";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootApp, Client, resetDatabase } from "./helpers.js";

// Nhập phả từ Excel (kiểm tra → xác nhận → hoàn tác) và xuất phả đồ PDF/SVG, danh sách Excel
let app: INestApplication;
let owner: Client;
let editor: Client;
let member: Client;
let clanId: string;
const url = (p: string) => `/clans/${clanId}${p}`;

/** Đọc phản hồi nhị phân (file tải về) */
const binary = (req: ReturnType<Client["agent"]["get"]>) =>
  req.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on("data", (c: Buffer) => chunks.push(c));
    res.on("end", () => cb(null, Buffer.concat(chunks)));
  });

async function workbook(rows: Array<Array<string | number>>, header?: string[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Danh sách");
  ws.addRow(header ?? ["Mã", "Họ và tên", "Giới tính", "Mã cha", "Mã mẹ", "Quan hệ với cha mẹ", "Thứ tự con", "Mã vợ/chồng", "Tên khác", "Ngày sinh", "Đã mất", "Ngày mất", "Ngày giỗ (âm lịch)"]);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const upload = (c: Client, file: Buffer, name = "gia-phả.xlsx") => c.agent.post(`/api/v1${url("/imports")}`).set("X-CSRF-Token", c.csrf).attach("file", file, name);
const treeNames = async () => ((await owner.get(url("/tree"))).body.nodes as Array<{ person: { fullName: string } }>).map((n) => n.person.fullName).sort();

const GOOD: Array<Array<string | number>> = [
  ["1", "Lê Văn Tổ", "Nam", "", "", "", "", "2", "Tự Phúc Hậu", "khoảng 1850", "", "12/3/1920 âm lịch"],
  ["2", "Nguyễn Thị Hiền", "Nữ", "", "", "", "", "", "", "", "x", "", "5/7"],
  ["3", "Lê Văn Cả", "Nam", "1", "2", "", 1, "4", "", "1880", "", "1945"],
  ["4", "Trần Thị Hoa", "Nữ", "", "", "", "", "", "", "", "x"],
  ["5", "Lê Thị Út", "Nữ", "1", "2", "", 2, "", "", "3/1890"],
  ["6", "Lê Văn Trưởng", "Nam", "3", "4", "", "", "", "", "12/5/1950"],
];
const ids: Record<string, string> = {};

beforeAll(async () => {
  await resetDatabase();
  app = await bootApp({ CLAN_MODE: "single" });
  owner = new Client(app);
  await owner.register("truong-ho@example.com", "Trưởng họ");
  clanId = (await owner.post("/clans", { name: "Họ Lê", slug: "ho-le", surname: "Lê" })).body.id;
  for (const [role, email] of [
    ["editor", "bt@example.com"],
    ["member", "tv@example.com"],
  ] as const) {
    const inv = await owner.post(url("/invitations"), { role });
    const c = new Client(app);
    await c.register(email, role);
    await c.post(`/invitations/${inv.body.token}/accept`);
    if (role === "editor") editor = c;
    else member = c;
  }
});
afterAll(async () => {
  await app.close();
});

describe("Nhập từ Excel", () => {
  it("file mẫu có trang Danh sách, Ví dụ, Hướng dẫn", async () => {
    const res = await binary(owner.agent.get(`/api/v1${url("/import/template.xlsx")}`));
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toBe('attachment; filename="mau-nhap-gia-pha.xlsx"');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Danh sách", "Ví dụ", "Hướng dẫn"]);
    expect(wb.getWorksheet("Danh sách")!.getRow(1).getCell(1).value).toBe("Mã");
  });

  it("chỉ quản trị được nhập; file không phải Excel → 422 dễ hiểu", async () => {
    expect((await upload(editor, await workbook(GOOD))).status).toBe(403);
    const bad = await upload(owner, Buffer.from("không phải excel"), "a.xlsx");
    expect(bad.status).toBe(422);
    expect(bad.body.message).toMatch(/Không đọc được file/);
    const noHeader = await upload(owner, await workbook([["x"]], ["Tên ông bà"]));
    expect(noHeader.body.message).toMatch(/Không tìm thấy dòng tiêu đề có cột “Mã” và “Họ và tên”/);
  });

  it("file có lỗi: báo theo dòng, tải file đánh dấu lỗi, không cho xác nhận", async () => {
    const res = await upload(owner, await workbook([...GOOD, ["7", "Lê Văn Lạc", "Nam", "N12"], ["3", "Trùng Mã"]]));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ok: false, errorCount: 2, fileName: "gia-phả.xlsx" });
    expect(res.body.errors).toEqual([
      { row: 8, column: "maCha", message: "Mã cha “N12” không có trong file (và không phải mã người đã có)" },
      { row: 9, column: "ma", message: "Mã “3” trùng với dòng 4. Mỗi người một mã khác nhau" },
    ]);
    const file = await binary(owner.agent.get(`/api/v1${url(`/imports/${res.body.id}/errors.xlsx`)}`));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.body as ArrayBuffer);
    const ws = wb.getWorksheet("Danh sách")!;
    expect(ws.getRow(8).getCell(2).value).toBe("Lê Văn Lạc");
    expect(String(ws.getRow(8).getCell(18).value)).toMatch(/Mã cha “N12”/);
    expect((ws.getRow(8).getCell(4).fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFF9DCD6");
    expect((await owner.post(url(`/imports/${res.body.id}/commit`))).body.code).toBe("IMPORT_HAS_ERRORS");
  });

  it("file đúng: xem trước rồi xác nhận → phả có đủ người, thuỷ tổ, ngày giỗ", async () => {
    const check = await upload(owner, await workbook(GOOD));
    expect(check.body).toMatchObject({ ok: true, errorCount: 0, summary: { newPeople: 6, newUnions: 2, links: 3, generations: [1, 3], rootName: "Lê Văn Tổ" } });
    // chưa xác nhận thì phả vẫn trống
    expect((await owner.get(url("/tree"))).body.nodes).toEqual([]);
    const done = await owner.post(url(`/imports/${check.body.id}/commit`));
    expect(done.status).toBe(200);
    expect(done.body.created).toBe(6);
    ids.first = check.body.id;
    expect(await treeNames()).toEqual(["Lê Thị Út", "Lê Văn Cả", "Lê Văn Trưởng", "Lê Văn Tổ", "Nguyễn Thị Hiền", "Trần Thị Hoa"]);
    const gio = (await owner.get(url("/anniversaries?days=400"))).body.items.map((a: { fullName: string; lunar: { day: number; month: number } }) => [a.fullName, a.lunar.day, a.lunar.month]);
    expect(gio).toEqual(expect.arrayContaining([["Lê Văn Tổ", 12, 3], ["Nguyễn Thị Hiền", 5, 7]]));
    // bấm xác nhận lần nữa không nhập trùng
    expect((await owner.post(url(`/imports/${check.body.id}/commit`))).body.code).toBe("IMPORT_ALREADY_DONE");
  });

  it("xuất danh sách → thêm dòng người mới nối vào người đã có → nhập lại", async () => {
    expect((await member.get(url("/export/persons.xlsx"))).status).toBe(403);
    const res = await binary(editor.agent.get(`/api/v1${url("/export/persons.xlsx")}`));
    expect(res.headers["content-disposition"]).toBe('attachment; filename="danh-sach-ho-le.xlsx"');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as ArrayBuffer);
    const ws = wb.getWorksheet("Danh sách")!;
    const rows: Record<string, string>[] = [];
    ws.eachRow((r, n) => {
      if (n === 1) return;
      rows.push({ ma: String(r.getCell(1).value), ten: String(r.getCell(2).value), ngayMat: String(r.getCell(12).value ?? ""), gio: String(r.getCell(13).value ?? "") });
    });
    expect(rows).toHaveLength(6);
    expect(rows.find((r) => r.ten === "Lê Văn Tổ")).toMatchObject({ ngayMat: "12/3/1920 âm lịch" });
    expect(rows.find((r) => r.ten === "Nguyễn Thị Hiền")).toMatchObject({ gio: "5/7" });
    const truong = rows.find((r) => r.ten === "Lê Văn Trưởng")!.ma;
    ws.addRow(["M1", "Lê Văn Cháu", "Nam", truong, "", "", "", "", "", "2001"]);
    const check = await upload(owner, Buffer.from(await wb.xlsx.writeBuffer()), "them-nhanh.xlsx");
    expect(check.body).toMatchObject({ ok: true, summary: { newPeople: 1, skippedExisting: 6, generations: [4, 4] } });
    expect((await owner.post(url(`/imports/${check.body.id}/commit`))).body.created).toBe(1);
    ids.second = check.body.id;
    expect(await treeNames()).toContain("Lê Văn Cháu");
  });

  it("lịch sử nhập; hoàn tác bị chặn khi đã có người nối thêm; hoàn tác lần sau rồi lần trước", async () => {
    const history = (await owner.get(url("/imports"))).body;
    expect(history.map((h: { status: string }) => h.status)).toEqual(["done", "done", "failed"]);
    expect(history[0]).toMatchObject({ fileName: "them-nhanh.xlsx", canRevert: true, by: "Trưởng họ" });

    const blocked = await owner.post(url(`/imports/${ids.first}/revert`));
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("IMPORT_REVERT_BLOCKED");

    expect((await owner.post(url(`/imports/${ids.second}/revert`))).status).toBe(204);
    expect(await treeNames()).not.toContain("Lê Văn Cháu");
    expect((await owner.post(url(`/imports/${ids.second}/revert`))).body.code).toBe("IMPORT_ALREADY_REVERTED");
    expect((await owner.post(url(`/imports/${ids.first}/revert`))).status).toBe(204);
    expect((await owner.get(url("/tree"))).body).toMatchObject({ rootId: null, nodes: [] });
    expect((await owner.get(url("/imports"))).body[0]).toMatchObject({ status: "reverted", canRevert: false });
  });
});

describe("Xuất phả đồ", () => {
  beforeAll(async () => {
    const check = await upload(owner, await workbook(GOOD));
    await owner.post(url(`/imports/${check.body.id}/commit`));
  });

  it("PDF cho mọi thành viên: đúng tên file, có phông nhúng", async () => {
    const res = await binary(member.agent.get(`/api/v1${url("/export/tree.pdf?paper=A4")}`));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="pha-do-ho-le.pdf"');
    const pdf = (res.body as Buffer).toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf).toMatch(/Alegreya\w*-Medium/);
    expect(pdf).toMatch(/BeVietnamPro-Regular/);
  });

  it("SVG: chữ tiếng Việt giữ nguyên, phông nhúng sẵn", async () => {
    const res = await binary(member.agent.get(`/api/v1${url("/export/tree.svg")}`));
    const svg = (res.body as Buffer).toString("utf8");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).toContain(">Lê Văn Trưởng</text>");
    expect(svg).toContain("@font-face{font-family:\"Alegreya GP Medium\"");
    expect(svg).toContain(">Họ Lê</text>");
  });

  it("báo trước số trang và cỡ chữ; phả trống / khổ giấy sai báo lỗi", async () => {
    const info = (await member.get(url("/export/tree-info?paper=A4&layout=mot-trang"))).body;
    expect(info).toMatchObject({ people: 6, generations: 3, pages: 1, readable: true });
    expect(info.nameHeightMm).toBeGreaterThan(2);
    expect((await member.get(url("/export/tree-info?paper=B5"))).status).toBe(422);
  });
});
