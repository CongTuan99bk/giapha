import ExcelJS from "exceljs";
import { type ColumnKey, COLUMNS, columnOfHeader, fold, type RawRow } from "./sheet-format.js";

/** Tên trang tính trong file mẫu / file xuất */
export const SHEET_LIST = "Danh sách";
const SHEET_GUIDE = "Hướng dẫn";
const SHEET_EXAMPLE = "Ví dụ";

const INK = "FF241A17";
const HEADER_FILL = "FFF4EAD6";
const ERROR_FILL = "FFF9DCD6";
const MAX_ROWS = 5000;

export interface ReadRow {
  /** Số dòng trong Excel (để báo lỗi "Dòng 45") */
  row: number;
  cells: RawRow;
}

export type ReadResult = { ok: true; sheet: string; rows: ReadRow[] } | { ok: false; message: string };

/** Chữ trong một ô: ngày Excel → "d/m/yyyy", công thức → kết quả, chữ định dạng → nối lại */
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return `${v.getUTCDate()}/${v.getUTCMonth() + 1}/${v.getUTCFullYear()}`;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "string") return v.trim();
  if (typeof v === "boolean") return v ? "x" : "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("").trim();
    if ("text" in v && typeof v.text === "string") return v.text.trim(); // ô có liên kết
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("error" in v) return "";
  }
  return String(v).trim();
}

/**
 * Đọc file Excel người dùng tải lên. Tìm trang có dòng tiêu đề (trong 10 dòng đầu) chứa cột "Mã" và "Họ và tên";
 * ưu tiên trang "Danh sách", bỏ qua trang "Hướng dẫn" và "Ví dụ" của file mẫu.
 */
export async function readWorkbook(buffer: Buffer): Promise<ReadResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return { ok: false, message: "Không đọc được file. Hãy lưu file dạng Excel (.xlsx) rồi tải lên lại." };
  }
  const sheets = [...wb.worksheets].sort((a, b) => Number(fold(b.name) === fold(SHEET_LIST)) - Number(fold(a.name) === fold(SHEET_LIST)));
  for (const ws of sheets) {
    if ([SHEET_GUIDE, SHEET_EXAMPLE].some((n) => fold(n) === fold(ws.name))) continue;
    for (let h = 1; h <= Math.min(10, ws.rowCount); h++) {
      const map = new Map<number, ColumnKey>();
      ws.getRow(h).eachCell((cell, col) => {
        const key = columnOfHeader(cellText(cell.value));
        if (key && ![...map.values()].includes(key)) map.set(col, key);
      });
      const keys = new Set(map.values());
      if (!keys.has("ma") || !keys.has("hoTen")) continue;
      const rows: ReadRow[] = [];
      for (let r = h + 1; r <= ws.rowCount; r++) {
        const cells: RawRow = {};
        let any = false;
        for (const [col, key] of map) {
          const t = cellText(ws.getRow(r).getCell(col).value);
          if (t) {
            cells[key] = t;
            any = true;
          }
        }
        if (any) rows.push({ row: r, cells });
        if (rows.length > MAX_ROWS) return { ok: false, message: `File có hơn ${MAX_ROWS.toLocaleString("vi-VN")} người. Hãy chia thành nhiều file và nhập lần lượt.` };
      }
      return { ok: true, sheet: ws.name, rows };
    }
  }
  return {
    ok: false,
    message: "Không tìm thấy dòng tiêu đề có cột “Mã” và “Họ và tên”. Hãy dùng file mẫu (bấm “Tải file mẫu”) và giữ nguyên dòng tiêu đề.",
  };
}

function styleHeader(ws: ExcelJS.Worksheet, withNotes: boolean) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: INK } };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 32;
  header.eachCell((cell, col) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFA8792A" } } };
    const note = COLUMNS[col - 1]?.note;
    if (withNotes && note) cell.note = note;
  });
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
}

function listSheet(wb: ExcelJS.Workbook, name: string, extra: Array<{ header: string; width: number }> = []) {
  const ws = wb.addWorksheet(name);
  ws.columns = [...COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width })), ...extra.map((e) => ({ header: e.header, key: e.header, width: e.width }))];
  // mã, ngày ghi dạng chữ: Excel không tự đổi "3/1950" thành ngày tháng kiểu Mỹ
  for (const key of ["ma", "maCha", "maMe", "maVoChong", "ngaySinh", "ngayMat", "ngayGio", "thuTu"] as const) ws.getColumn(key).numFmt = "@";
  return ws;
}

const EXAMPLE: RawRow[] = [
  { ma: "1", hoTen: "Lê Văn Tổ", gioiTinh: "Nam", maVoChong: "2", tenKhac: "Tự Phúc Hậu", ngaySinh: "khoảng 1850", ngayMat: "12/3/1920 âm lịch", queQuan: "Thôn Đông, xã An Hoà", noiAnTang: "Đồng Mả Cả" },
  { ma: "2", hoTen: "Nguyễn Thị Hiền", gioiTinh: "Nữ", daMat: "x", ngayGio: "5/7" },
  { ma: "3", hoTen: "Lê Văn Cả", gioiTinh: "Nam", maCha: "1", maMe: "2", thuTu: "1", maVoChong: "5; 6", ngaySinh: "1880", ngayMat: "1945", ngayGio: "20/8" },
  { ma: "4", hoTen: "Lê Thị Út", gioiTinh: "Nữ", maCha: "1", maMe: "2", thuTu: "2", ngaySinh: "3/1890" },
  { ma: "5", hoTen: "Trần Thị Hoa", gioiTinh: "Nữ", daMat: "x" },
  { ma: "6", hoTen: "Phạm Thị Lan", gioiTinh: "Nữ", daMat: "x" },
  { ma: "7", hoTen: "Lê Văn Trưởng", gioiTinh: "Nam", maCha: "3", maMe: "5", thuTu: "1", ngaySinh: "12/5/1950", ngheNghiep: "Giáo viên" },
  { ma: "8", hoTen: "Lê Văn Nuôi", gioiTinh: "Nam", maCha: "3", maMe: "6", quanHe: "Con nuôi", ngaySinh: "1955" },
];

const GUIDE = [
  ["Cách điền file gia phả", true],
  ["1. Điền ở trang “Danh sách”: mỗi người một dòng. Giữ nguyên dòng tiêu đề (dòng 1). Xem trang “Ví dụ” để thấy cách điền ba đời một nhà.", false],
  ["2. Cột “Mã”: tự đặt cho mỗi người một mã khác nhau (1, 2, 3… hoặc A1, B12…). Mã chỉ dùng để nối cha mẹ, vợ chồng trong file.", false],
  ["3. Nối quan hệ bằng mã: con ghi “Mã cha”, “Mã mẹ”; vợ chồng ghi “Mã vợ/chồng” ở một trong hai người (ghi cả hai phía cũng được).", false],
  ["   Cha có nhiều vợ: ghi “Mã mẹ” cho từng con để biết con của bà nào. Nhiều vợ ghi theo thứ tự vợ cả trước, cách nhau dấu ; (ví dụ: 5; 6).", false],
  ["4. Thứ tự con: 1 = con trưởng, 2 = con thứ… Thứ tự này dùng để xưng hô bác/chú giữa các nhánh, nên ghi đúng thứ tự sinh.", false],
  ["5. Ngày tháng: 1950 · 3/1950 · 12/3/1950 · khoảng 1950. Ngày âm lịch thêm chữ “âm lịch” (12/3/1920 âm lịch), tháng nhuận thêm “nhuận”.", false],
  ["   Chỉ biết ngày giỗ, không rõ năm mất: ghi vào cột “Ngày giỗ (âm lịch)”, ví dụ 12/3.", false],
  ["6. Người đã mất mà không rõ ngày: ghi x ở cột “Đã mất”. Có ngày mất hoặc ngày giỗ thì tự hiểu là đã mất.", false],
  ["7. Thuỷ tổ là người đầu tiên không có cha mẹ trong file. Mọi người khác phải nối được vào cây qua cha mẹ hoặc vợ chồng.", false],
  ["8. Đã có phả trên hệ thống, muốn thêm một nhánh: vào Nhập – xuất → “Xuất danh sách Excel”, thêm dòng mới vào file đó (người mới ghi Mã cha là mã của người đã có), rồi nhập lại. Dòng của người đã có được bỏ qua, không bị sửa.", false],
  ["9. Tải file lên ở Nhập – xuất → “Nhập từ Excel”. Hệ thống kiểm tra trước; có lỗi sẽ báo theo từng dòng và cho tải file đánh dấu lỗi để sửa. Nhập xong vẫn hoàn tác được trong 24 giờ.", false],
  ["Các cột", true],
  ...COLUMNS.map((c) => [`${c.header}: ${c.note || "(không bắt buộc)"}`, false] as const),
] as const;

/** File mẫu: trang Danh sách (trống), trang Ví dụ, trang Hướng dẫn */
export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gia Phả Cội Nguồn";
  const list = listSheet(wb, SHEET_LIST);
  styleHeader(list, true);
  const ex = listSheet(wb, SHEET_EXAMPLE);
  for (const r of EXAMPLE) ex.addRow(r);
  styleHeader(ex, false);
  const guide = wb.addWorksheet(SHEET_GUIDE);
  guide.getColumn(1).width = 120;
  for (const [text, bold] of GUIDE) {
    const row = guide.addRow([text]);
    row.font = bold ? { bold: true, size: 13, color: { argb: "FF8E2B21" } } : { size: 11 };
    row.alignment = { wrapText: true, vertical: "top" };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Xuất danh sách: đúng cột của file mẫu (+ cột Đời chỉ để xem) để thêm dòng rồi nhập lại */
export async function buildListWorkbook(rows: Array<RawRow & { doi?: number | null }>, title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gia Phả Cội Nguồn";
  wb.title = title;
  const ws = listSheet(wb, SHEET_LIST, [{ header: "Đời (chỉ để xem)", width: 9 }]);
  for (const r of rows) ws.addRow({ ...r, "Đời (chỉ để xem)": r.doi ?? "" });
  styleHeader(ws, true);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length + 1 } };
  const guide = wb.addWorksheet(SHEET_GUIDE);
  guide.getColumn(1).width = 120;
  for (const [text, bold] of GUIDE) {
    const row = guide.addRow([text]);
    row.font = bold ? { bold: true, size: 13, color: { argb: "FF8E2B21" } } : { size: 11 };
    row.alignment = { wrapText: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface CellError {
  row: number;
  column: ColumnKey | null;
  message: string;
}

/** File đánh dấu lỗi: nội dung người dùng đã điền, ô lỗi tô đỏ kèm ghi chú, cột "Lỗi" cuối mỗi dòng */
export async function buildErrorWorkbook(rows: ReadRow[], errors: CellError[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gia Phả Cội Nguồn";
  const ws = listSheet(wb, SHEET_LIST, [{ header: "Lỗi cần sửa", width: 60 }]);
  const byRow = new Map<number, CellError[]>();
  for (const e of errors) (byRow.get(e.row) ?? byRow.set(e.row, []).get(e.row)!).push(e);
  // giữ đúng số dòng như file gốc để người dùng dễ đối chiếu
  for (const r of rows) {
    const row = ws.getRow(r.row);
    COLUMNS.forEach((c, i) => {
      const v = r.cells[c.key];
      if (v) row.getCell(i + 1).value = v;
    });
    const errs = byRow.get(r.row);
    if (errs) {
      row.getCell(COLUMNS.length + 1).value = errs.map((e) => e.message).join("\n");
      row.getCell(COLUMNS.length + 1).font = { color: { argb: "FF8E2B21" } };
      row.getCell(COLUMNS.length + 1).alignment = { wrapText: true, vertical: "top" };
      for (const e of errs) {
        const idx = e.column ? COLUMNS.findIndex((c) => c.key === e.column) : -1;
        if (idx < 0) continue;
        const cell = row.getCell(idx + 1);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ERROR_FILL } };
        cell.note = e.message;
      }
    }
  }
  styleHeader(ws, false);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
