import type { FlexibleDate } from "@coinguon/schemas";

/**
 * Định dạng file Excel gia phả — dùng chung cho file mẫu, đọc file nhập và xuất danh sách,
 * để xuất ra rồi thêm dòng mới và nhập lại được ngay.
 */
export const COLUMNS = [
  { key: "ma", header: "Mã", width: 10, note: "Bắt buộc. Mỗi người một mã khác nhau, tự đặt: 1, 2, 3… hoặc A1, A2…" },
  { key: "hoTen", header: "Họ và tên", width: 26, note: "Bắt buộc." },
  { key: "gioiTinh", header: "Giới tính", width: 10, note: "Nam / Nữ. Để trống nếu không rõ." },
  { key: "maCha", header: "Mã cha", width: 10, note: "Mã của cha (ở dòng khác trong file, hoặc mã người đã có lấy từ file xuất)." },
  { key: "maMe", header: "Mã mẹ", width: 10, note: "Mã của mẹ. Cha có nhiều vợ thì bắt buộc điền để biết con của bà nào." },
  { key: "quanHe", header: "Quan hệ với cha mẹ", width: 14, note: "Con ruột (mặc định) / Con nuôi / Con riêng." },
  { key: "thuTu", header: "Thứ tự con", width: 9, note: "1 = con trưởng, 2 = con thứ… Để trống thì theo thứ tự dòng." },
  { key: "maVoChong", header: "Mã vợ/chồng", width: 13, note: "Nhiều vợ/chồng: cách nhau bằng dấu ; theo thứ tự (vợ cả trước). Chỉ cần ghi ở một phía." },
  { key: "tenKhac", header: "Tên khác", width: 18, note: "Tên tự, hiệu, tên thường gọi… cách nhau bằng dấu ;" },
  { key: "ngaySinh", header: "Ngày sinh", width: 14, note: "1950 · 3/1950 · 12/3/1950 · khoảng 1950. Âm lịch thêm chữ “âm lịch”: 12/3/1950 âm lịch." },
  { key: "daMat", header: "Đã mất", width: 8, note: "Ghi x nếu đã mất mà không rõ ngày mất. Có ngày mất / ngày giỗ thì tự hiểu là đã mất." },
  { key: "ngayMat", header: "Ngày mất", width: 16, note: "Cách ghi như ngày sinh. Ngày mất âm lịch đủ ngày tháng thì ngày giỗ tự tính." },
  { key: "ngayGio", header: "Ngày giỗ (âm lịch)", width: 14, note: "Khi không rõ năm mất: ngày/tháng âm lịch, ví dụ 12/3 · 5/4 nhuận." },
  { key: "queQuan", header: "Quê quán", width: 18, note: "" },
  { key: "ngheNghiep", header: "Nghề nghiệp", width: 18, note: "Nghề, chức tước, học vị." },
  { key: "noiAnTang", header: "Nơi an táng", width: 18, note: "Mộ phần." },
  { key: "tieuSu", header: "Tiểu sử, ghi chú", width: 40, note: "" },
] as const;
export type ColumnKey = (typeof COLUMNS)[number]["key"];
export type RawRow = Partial<Record<ColumnKey, string>>;
export const HEADER_OF = Object.fromEntries(COLUMNS.map((c) => [c.key, c.header])) as Record<ColumnKey, string>;

/** Bỏ dấu, chữ thường, gộp khoảng trắng — so khớp tiêu đề cột và chữ người dùng gõ */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Tiêu đề (đã bỏ dấu) → cột; chấp nhận vài cách gọi khác thường gặp */
const HEADER_ALIASES: Record<string, ColumnKey> = {
  ...Object.fromEntries(COLUMNS.map((c) => [fold(c.header), c.key])),
  "ma so": "ma",
  stt: "ma",
  "ho ten": "hoTen",
  ten: "hoTen",
  "gioi": "gioiTinh",
  "ma vo chong": "maVoChong",
  "ma vo": "maVoChong",
  "ma chong": "maVoChong",
  "vo/chong": "maVoChong",
  "thu tu": "thuTu",
  "con thu": "thuTu",
  "ngay gio": "ngayGio",
  "gio": "ngayGio",
  "nam sinh": "ngaySinh",
  "nam mat": "ngayMat",
  "que": "queQuan",
  "nghe": "ngheNghiep",
  "mo phan": "noiAnTang",
  "tieu su": "tieuSu",
  "ghi chu": "tieuSu",
  "quan he": "quanHe",
};
export function columnOfHeader(text: string): ColumnKey | null {
  return HEADER_ALIASES[fold(text).replace(/\s*\(.*\)\s*$/, "").trim()] ?? HEADER_ALIASES[fold(text)] ?? null;
}

// ───────────── Ngày tháng ─────────────

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

const DATE_HELP = "Ví dụ: 1950 · 3/1950 · 12/3/1950 · khoảng 1950 · 12/3/1950 âm lịch";

/**
 * Đọc ngày kiểu Việt Nam: "1950", "3/1950", "12/3/1950", "12-03-1950", "1950-03-12", "khoảng 1950",
 * thêm "âm lịch" / "ÂL" cho ngày âm, "nhuận" cho tháng nhuận. Ô Excel kiểu ngày (Date) là dương lịch.
 */
export function parseDate(input: string | Date | number | null | undefined): ParseResult<FlexibleDate | null> {
  if (input === null || input === undefined || input === "") return { ok: true, value: null };
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return { ok: false, message: "Ngày không hợp lệ" };
    return { ok: true, value: { calendar: "solar", precision: "day", year: input.getUTCFullYear(), month: input.getUTCMonth() + 1, day: input.getUTCDate() } };
  }
  const raw = String(input).trim();
  let s = fold(raw);
  const lunar = /\b(am lich|am|al)\b|\(al\)/.test(s);
  const leap = /\bnhuan\b/.test(s);
  const approx = /^(khoang|chung|k\.|~|ca\.?)\s*/.test(s) || /\s(khoang|chung)$/.test(s);
  s = s
    .replace(/\(al\)|\b(am lich|duong lich|am|al|nhuan|khoang|chung|nam|ngay|thang)\b|~|ca\./g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // "ngày 5 tháng 4 năm 1941" → "5/4/1941"
    .replace(/(\d)\s+(?=\d)/g, "$1/");
  const calendar = lunar ? "lunar" : "solar";
  const base = { calendar, ...(leap && lunar ? { isLeapMonth: true } : {}), ...(raw.length <= 200 ? { raw } : {}) } as const;
  let m: RegExpMatchArray | null;
  const check = (d: FlexibleDate): ParseResult<FlexibleDate> => {
    if (d.year < 1000 || d.year > 2199) return { ok: false, message: `Năm ${d.year} không hợp lệ. ${DATE_HELP}` };
    if (d.month !== undefined && (d.month < 1 || d.month > 12)) return { ok: false, message: `Tháng ${d.month} không hợp lệ. ${DATE_HELP}` };
    if (d.day !== undefined && (d.day < 1 || d.day > (lunar ? 30 : 31))) return { ok: false, message: `Ngày ${d.day} không hợp lệ. ${DATE_HELP}` };
    if (leap && !lunar) return { ok: false, message: "Tháng nhuận chỉ có ở âm lịch — thêm chữ “âm lịch”" };
    return { ok: true, value: d };
  };
  if ((m = s.match(/^(\d{4})$/))) return check({ ...base, precision: approx ? "approx" : "year", year: +m[1]! });
  if ((m = s.match(/^(\d{1,2})[/.-](\d{4})$/))) return check({ ...base, precision: "month", year: +m[2]!, month: +m[1]! });
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) return check({ ...base, precision: "day", year: +m[3]!, month: +m[2]!, day: +m[1]! });
  if ((m = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/))) return check({ ...base, precision: "day", year: +m[1]!, month: +m[2]!, day: +m[3]! });
  return { ok: false, message: `Không hiểu ngày “${raw}”. ${DATE_HELP}` };
}

/** Ngày ra chữ theo đúng cách `parseDate` đọc được (để xuất rồi nhập lại không mất thông tin) */
export function formatDate(d: FlexibleDate | null | undefined): string {
  if (!d) return "";
  let s: string;
  if (d.precision === "day" && d.day && d.month) s = `${d.day}/${d.month}/${d.year}`;
  else if (d.precision === "month" && d.month) s = `${d.month}/${d.year}`;
  else s = `${d.precision === "approx" ? "khoảng " : ""}${d.year}`;
  if (d.calendar === "lunar") s += d.isLeapMonth ? " âm lịch nhuận" : " âm lịch";
  return s;
}

export interface LunarDayMonth {
  day: number;
  month: number;
  isLeapMonth: boolean;
}

/** Ngày giỗ âm lịch không năm: "12/3", "12-3", "5/4 nhuận" */
export function parseAnniversary(input: string | null | undefined): ParseResult<LunarDayMonth | null> {
  if (!input || !String(input).trim()) return { ok: true, value: null };
  const s = fold(String(input));
  const leap = /\bnhuan\b/.test(s);
  const m = s.replace(/\b(am lich|am|al|nhuan|ngay|thang)\b/g, " ").trim().match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})$/);
  if (!m) return { ok: false, message: `Không hiểu ngày giỗ “${input}”. Ghi ngày/tháng âm lịch, ví dụ 12/3 hoặc 5/4 nhuận` };
  const day = +m[1]!;
  const month = +m[2]!;
  if (day < 1 || day > 30 || month < 1 || month > 12) return { ok: false, message: `Ngày giỗ “${input}” không hợp lệ (ngày 1–30, tháng 1–12)` };
  return { ok: true, value: { day, month, isLeapMonth: leap } };
}

export function formatAnniversary(a: LunarDayMonth | null | undefined): string {
  return a ? `${a.day}/${a.month}${a.isLeapMonth ? " nhuận" : ""}` : "";
}

// ───────────── Các ô khác ─────────────

export function parseGender(s: string | undefined): ParseResult<"male" | "female" | "unknown"> {
  const f = fold(s ?? "");
  if (!f || f === "?" || f === "khong ro") return { ok: true, value: "unknown" };
  if (["nam", "trai", "m", "male", "ong"].includes(f)) return { ok: true, value: "male" };
  if (["nu", "gai", "f", "female", "ba"].includes(f)) return { ok: true, value: "female" };
  return { ok: false, message: `Giới tính “${s}” — ghi Nam hoặc Nữ` };
}
export const GENDER_TEXT = { male: "Nam", female: "Nữ", unknown: "" } as const;

export function parseRelation(s: string | undefined): ParseResult<"biological" | "adopted" | "step"> {
  const f = fold(s ?? "").replace(/^con\s+/, "");
  if (!f || f === "ruot" || f === "de") return { ok: true, value: "biological" };
  if (f === "nuoi") return { ok: true, value: "adopted" };
  if (f === "rieng" || f === "ke" || f === "chong truoc" || f === "vo truoc") return { ok: true, value: "step" };
  return { ok: false, message: `“${s}” — ghi Con ruột, Con nuôi hoặc Con riêng` };
}
export const RELATION_TEXT = { biological: "Con ruột", adopted: "Con nuôi", step: "Con riêng" } as const;

export function parseYesNo(s: string | undefined): boolean | null {
  const f = fold(s ?? "");
  if (!f) return null;
  if (["x", "co", "roi", "da mat", "mat", "yes", "1", "v", "✓"].includes(f)) return true;
  if (["khong", "chua", "no", "0", "con song"].includes(f)) return false;
  return null;
}

/** "A1; A2, A3" → ["A1","A2","A3"] */
export function splitCodes(s: string | undefined): string[] {
  return (s ?? "")
    .split(/[;,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Mã so khớp không phân biệt hoa thường, bỏ khoảng trắng */
export const codeKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
