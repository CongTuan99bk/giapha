import { canChiOfYear, lunarMonthName } from "@coinguon/lunar-vn";
import type { FlexibleDate, Gender, Person } from "./types";

/** "1920 – 1990", "1920 –" (còn sống: "s. 1990"), "?" khi không rõ. */
export { lifespan } from "@coinguon/genealogy-core";

/** Ngày linh hoạt thành chữ: "12/3/1950", "tháng 3/1950", "khoảng 1950", âm lịch thêm "(âm lịch)". */
export function formatFlexibleDate(d: FlexibleDate | null | undefined): string {
  if (!d) return "";
  let s: string;
  if (d.calendar === "lunar") {
    const leap = d.isLeapMonth ? " nhuận" : "";
    const year = `năm ${canChiOfYear(d.year)} (${d.year})`;
    if (d.precision === "day" && d.day && d.month) s = `${d.day <= 10 ? "mùng " : "ngày "}${d.day} tháng ${lunarMonthName(d.month)}${leap} ${year}`;
    else if (d.precision === "month" && d.month) s = `tháng ${lunarMonthName(d.month)}${leap} ${year}`;
    else s = (d.precision === "approx" ? "khoảng " : "") + year;
    return `${s}, âm lịch`;
  }
  if (d.precision === "day" && d.day && d.month) return `${d.day}/${d.month}/${d.year}`;
  if (d.precision === "month" && d.month) return `tháng ${d.month}/${d.year}`;
  if (d.precision === "approx") return `khoảng ${d.year}`;
  return String(d.year);
}

export function formatAnniversary(a: Person["deathAnniversaryLunar"]): string {
  if (!a) return "";
  return `${a.day <= 10 ? "mùng " : "ngày "}${a.day} tháng ${lunarMonthName(a.month)}${a.isLeapMonth ? " nhuận" : ""} (âm lịch)`;
}

export const GENDER_LABEL: Record<Gender, string> = { male: "Nam", female: "Nữ", unknown: "Chưa rõ" };

/** Ô nhập ngày trên form: chuỗi để giữ đúng những gì người dùng gõ. */
export interface DateFields {
  calendar: "solar" | "lunar";
  day: string;
  month: string;
  year: string;
  approx: boolean;
  isLeapMonth: boolean;
}

export const emptyDateFields = (): DateFields => ({
  calendar: "solar",
  day: "",
  month: "",
  year: "",
  approx: false,
  isLeapMonth: false,
});

export function toDateFields(d: FlexibleDate | null | undefined): DateFields {
  if (!d) return emptyDateFields();
  return {
    calendar: d.calendar,
    day: d.day ? String(d.day) : "",
    month: d.month ? String(d.month) : "",
    year: String(d.year),
    approx: d.precision === "approx",
    isLeapMonth: Boolean(d.isLeapMonth),
  };
}

/**
 * Chuyển ô nhập thành FlexibleDate. Không có năm → null (không rõ ngày).
 * Trả về chuỗi lỗi khi dữ liệu không hợp lý để form hiển thị ngay, không cần gọi API.
 */
export function fromDateFields(f: DateFields): FlexibleDate | null | string {
  const year = f.year.trim();
  const day = f.day.trim();
  const month = f.month.trim();
  if (!year) return day || month ? "Cần nhập năm" : null;
  if (!/^\d{3,4}$/.test(year)) return "Năm phải là số, ví dụ 1945";
  const y = Number(year);
  if (y < 1000 || y > 2199) return "Năm nằm ngoài khoảng 1000–2199";
  if (day && !month) return "Có ngày thì cần nhập tháng";
  const m = month ? Number(month) : undefined;
  const d = day ? Number(day) : undefined;
  if (m !== undefined && (!Number.isInteger(m) || m < 1 || m > 12)) return "Tháng từ 1 đến 12";
  const maxDay = f.calendar === "lunar" ? 30 : 31;
  if (d !== undefined && (!Number.isInteger(d) || d < 1 || d > maxDay)) return `Ngày từ 1 đến ${maxDay}`;
  const leap = f.calendar === "lunar" && f.isLeapMonth && m !== undefined ? { isLeapMonth: true } : {};
  if (f.approx) return { calendar: f.calendar, precision: "approx", year: y };
  if (d !== undefined && m !== undefined) return { calendar: f.calendar, precision: "day", year: y, month: m, day: d, ...leap };
  if (m !== undefined) return { calendar: f.calendar, precision: "month", year: y, month: m, ...leap };
  return { calendar: f.calendar, precision: "year", year: y };
}

/** "Họ Nguyễn Đức – Làng Đông Ngạc" → "ho-nguyen-duc-lang-dong-ngac" (gợi ý địa chỉ trang dòng họ). */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** "+84912345678" → "0912 345 678" (số Việt Nam); số quốc tế giữ nguyên. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const m = /^\+84(\d+)$/.exec(phone);
  if (!m) return phone;
  const local = `0${m[1]}`;
  return local.length === 10 ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : local;
}

/** Tên đăng nhập để hiển thị: số điện thoại (dễ nhận ra với người lớn tuổi) hoặc email. */
export function loginLabel(u: { email: string | null; phone: string | null }): string {
  return [formatPhone(u.phone), u.email].filter(Boolean).join(" · ");
}
