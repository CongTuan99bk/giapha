import { describe, expect, it } from "vitest";
import { type ExistingPerson, planImport } from "../src/import-export/import-plan.js";
import { formatAnniversary, formatDate, parseAnniversary, parseDate } from "../src/import-export/sheet-format.js";
import type { ReadRow } from "../src/import-export/workbook.js";

const rows = (...list: Array<Record<string, string>>): ReadRow[] => list.map((cells, i) => ({ row: i + 2, cells }));
const empty = { existing: new Map<string, ExistingPerson>(), existingUnions: [], clanHasRoot: false };

describe("Đọc ngày kiểu Việt Nam", () => {
  it.each([
    ["1950", { calendar: "solar", precision: "year", year: 1950 }],
    ["3/1950", { calendar: "solar", precision: "month", year: 1950, month: 3 }],
    ["12/3/1950", { calendar: "solar", precision: "day", year: 1950, month: 3, day: 12 }],
    ["1950-03-12", { calendar: "solar", precision: "day", year: 1950, month: 3, day: 12 }],
    ["khoảng 1850", { calendar: "solar", precision: "approx", year: 1850 }],
    ["12/3/1920 âm lịch", { calendar: "lunar", precision: "day", year: 1920, month: 3, day: 12 }],
    ["Ngày 5 tháng 4 nhuận năm 1941 ÂL", { calendar: "lunar", precision: "day", year: 1941, month: 4, day: 5, isLeapMonth: true }],
    ["tháng 3 năm 1950", { calendar: "solar", precision: "month", year: 1950, month: 3 }],
    ["hôm qua", null],
    ["5/4/1941 al nhuận", { calendar: "lunar", precision: "day", year: 1941, month: 4, day: 5, isLeapMonth: true }],
  ])("%s", (text, expected) => {
    const r = parseDate(text);
    if (expected === null) expect(r.ok).toBe(false);
    else expect(r).toEqual({ ok: true, value: expect.objectContaining(expected) });
  });

  it("ngày sai báo lỗi kèm ví dụ; ô ngày Excel là dương lịch", () => {
    const bad = parseDate("31/2/abc");
    expect(bad.ok).toBe(false);
    expect(parseDate("32/1/1950")).toMatchObject({ ok: false, message: expect.stringContaining("Ngày 32") });
    expect(parseDate(new Date(Date.UTC(1950, 2, 12)))).toEqual({ ok: true, value: { calendar: "solar", precision: "day", year: 1950, month: 3, day: 12 } });
  });

  it("xuất rồi đọc lại không mất thông tin", () => {
    for (const t of ["1950", "3/1950", "12/3/1950", "khoảng 1850", "12/3/1920 âm lịch", "5/4/1941 âm lịch nhuận"]) {
      const d = parseDate(t);
      expect(d.ok && formatDate(d.value)).toBe(t);
    }
    const g = parseAnniversary("5/4 nhuận");
    expect(g.ok && formatAnniversary(g.value)).toBe("5/4 nhuận");
  });
});

describe("Lập kế hoạch nhập", () => {
  it("ba đời: thuỷ tổ, vợ cả vợ hai, con theo mẹ, con nuôi, thứ tự con", () => {
    const plan = planImport({
      ...empty,
      rows: rows(
        { ma: "1", hoTen: "Lê Văn Tổ", gioiTinh: "Nam", maVoChong: "2", ngayMat: "12/3/1920 âm lịch" },
        { ma: "2", hoTen: "Nguyễn Thị Hiền", gioiTinh: "Nữ", ngayGio: "5/7" },
        { ma: "3", hoTen: "Lê Văn Cả", gioiTinh: "Nam", maCha: "1", maMe: "2", thuTu: "2", maVoChong: "5; 6" },
        { ma: "4", hoTen: "Lê Thị Út", gioiTinh: "Nữ", maCha: "1", maMe: "2", thuTu: "1" },
        { ma: "5", hoTen: "Trần Thị Hoa", gioiTinh: "Nữ", daMat: "x" },
        { ma: "6", hoTen: "Phạm Thị Lan", gioiTinh: "Nữ" },
        { ma: "7", hoTen: "Lê Văn Trưởng", gioiTinh: "Nam", maCha: "3", maMe: "5" },
        { ma: "8", hoTen: "Lê Văn Nuôi", gioiTinh: "Nam", maCha: "3", maMe: "6", quanHe: "Con nuôi" },
      ),
    });
    expect(plan.errors).toEqual([]);
    expect(plan.rootCode).toBe("1");
    expect(plan.summary).toMatchObject({ newPeople: 8, newUnions: 3, links: 4, deceased: 3, generations: [1, 3], rootName: "Lê Văn Tổ" });
    const wives = plan.unions.filter((u) => u.a.kind === "new" && u.a.code === "3");
    expect(wives.map((u) => [u.b?.kind === "new" && u.b.code, u.orderIndex])).toEqual([
      ["5", 1],
      ["6", 2],
    ]);
    // con trưởng theo cột "Thứ tự con", không theo thứ tự dòng
    const kids = plan.links.filter((l) => l.unionKey.includes("n:1")).sort((a, b) => a.birthOrder - b.birthOrder);
    expect(kids.map((k) => k.childCode)).toEqual(["4", "3"]);
    expect(plan.links.find((l) => l.childCode === "8")).toMatchObject({ relation: "adopted" });
    expect(plan.persons.find((p) => p.code === "2")).toMatchObject({ anniversary: { day: 5, month: 7, isLeapMonth: false }, input: { isLiving: false } });
  });

  it("báo lỗi theo dòng: trùng mã, mã cha không có, cha là nữ, người không nối vào cây", () => {
    const plan = planImport({
      ...empty,
      rows: rows(
        { ma: "1", hoTen: "Lê Văn Tổ", gioiTinh: "Nam" },
        { ma: "1", hoTen: "Lê Văn Trùng" },
        { ma: "3", hoTen: "Lê Văn Con", maCha: "N12" },
        { ma: "4", hoTen: "Lê Thị Mẹ", gioiTinh: "Nữ" },
        { ma: "5", hoTen: "Lê Văn Cháu", maCha: "4" },
        { ma: "6", hoTen: "", ngaySinh: "hôm qua" },
      ),
    });
    const msg = (row: number) => plan.errors.filter((e) => e.row === row).map((e) => `${e.column}: ${e.message}`);
    expect(msg(3)).toEqual([expect.stringMatching(/^ma: Mã “1” trùng với dòng 2/)]);
    expect(msg(4)).toEqual([expect.stringMatching(/^maCha: Mã cha “N12” không có trong file/)]);
    expect(msg(6)).toEqual([expect.stringMatching(/^maCha: Mã cha “4” là Lê Thị Mẹ \(nữ\) — có phải Mã mẹ\?/)]);
    expect(msg(5)).toEqual([expect.stringMatching(/^ma: Lê Thị Mẹ chưa nối vào cây.*thuỷ tổ \(Lê Văn Tổ, dòng 2\)/)]);
    expect(msg(7)).toEqual(expect.arrayContaining([expect.stringMatching(/^hoTen: Thiếu họ và tên/), expect.stringMatching(/^ngaySinh: Không hiểu ngày “hôm qua”/)]));
  });

  it("vòng lặp tổ tiên; cha nhiều vợ mà con thiếu Mã mẹ", () => {
    const loop = planImport({
      ...empty,
      rows: rows({ ma: "1", hoTen: "Gốc" }, { ma: "2", hoTen: "A", maCha: "3" }, { ma: "3", hoTen: "B", maCha: "2" }),
    });
    expect(loop.errors.some((e) => /Vòng lặp tổ tiên/.test(e.message))).toBe(true);
    const wives = planImport({
      ...empty,
      rows: rows(
        { ma: "1", hoTen: "Ông", gioiTinh: "Nam", maVoChong: "2;3" },
        { ma: "2", hoTen: "Bà cả", gioiTinh: "Nữ" },
        { ma: "3", hoTen: "Bà hai", gioiTinh: "Nữ" },
        { ma: "4", hoTen: "Con", maCha: "1" },
      ),
    });
    expect(wives.errors).toEqual([{ row: 5, column: "maMe", message: "Ông có 2 vợ/chồng — điền Mã mẹ để biết là con của ai" }]);
  });

  it("nối vào phả đã có: dòng người đã có bỏ qua, người mới nhận mã người đã có làm cha", () => {
    const id = "6f1c2d1e-1111-4a1a-9a1a-111111111111";
    const plan = planImport({
      existing: new Map([[id, { id, fullName: "Lê Văn Có", gender: "male", inClan: true, generation: 4 }]]),
      existingUnions: [{ id: "6f1c2d1e-2222-4a1a-9a1a-222222222222", a: id, b: null, maxChildOrder: 2 }],
      clanHasRoot: true,
      rows: rows({ ma: id, hoTen: "Lê Văn Có" }, { ma: "M1", hoTen: "Lê Văn Mới", gioiTinh: "Nam", maCha: id.toUpperCase() }, { ma: "M2", hoTen: "Lạc Lõng" }),
    });
    expect(plan.summary).toMatchObject({ newPeople: 2, skippedExisting: 1, generations: [5, 5] });
    expect(plan.links).toEqual([{ unionKey: "u:6f1c2d1e-2222-4a1a-9a1a-222222222222", childCode: "M1", relation: "biological", birthOrder: 3 }]);
    expect(plan.errors).toEqual([expect.objectContaining({ row: 4, column: "ma", message: expect.stringMatching(/chưa nối vào phả đã có/) })]);
  });

  it("sinh trước hơn 110 năm mà chưa ghi đã mất → hiểu là đã mất, có cảnh báo", () => {
    const plan = planImport({ ...empty, rows: rows({ ma: "1", hoTen: "Cụ Tổ", ngaySinh: "1850" }), now: new Date("2026-11-09") });
    expect(plan.persons[0]!.input.isLiving).toBe(false);
    expect(plan.warnings).toEqual([expect.objectContaining({ row: 2, column: "daMat" })]);
  });
});
