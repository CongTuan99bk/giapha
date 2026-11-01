import { solarToJd } from "./calendar.js";
import type { LunarDate, SolarDate } from "./types.js";

const CAN = ["Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý"] as const;
const CHI = [
  "Tý",
  "Sửu",
  "Dần",
  "Mão",
  "Thìn",
  "Tỵ",
  "Ngọ",
  "Mùi",
  "Thân",
  "Dậu",
  "Tuất",
  "Hợi",
] as const;

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** Can chi của năm âm lịch, ví dụ 2026 → "Bính Ngọ". */
export function canChiOfYear(lunarYear: number): string {
  return `${CAN[mod(lunarYear + 6, 10)]} ${CHI[mod(lunarYear + 8, 12)]}`;
}

/** Can chi của ngày dương lịch (chu kỳ 60 ngày theo số ngày Julius). */
export function canChiOfDay(date: SolarDate): string {
  const jd = solarToJd(date);
  return `${CAN[mod(jd + 9, 10)]} ${CHI[mod(jd + 1, 12)]}`;
}

/** Tên tháng âm lịch: 1 → "Giêng", 12 → "Chạp", còn lại là số. */
export function lunarMonthName(month: number): string {
  if (month === 1) return "Giêng";
  if (month === 12) return "Chạp";
  return String(month);
}

/** Ví dụ: "mùng 1 tháng Giêng năm Ất Tỵ", "ngày 15 tháng 6 nhuận năm Ất Tỵ". */
export function formatLunarDate(d: LunarDate): string {
  const dayPart = d.day <= 10 ? `mùng ${d.day}` : `ngày ${d.day}`;
  const leap = d.isLeapMonth ? " nhuận" : "";
  return `${dayPart} tháng ${lunarMonthName(d.month)}${leap} năm ${canChiOfYear(d.year)}`;
}

/** Ví dụ: "15/6N" (N = nhuận) — dạng ngắn cho lịch, ô nhỏ. */
export function formatLunarShort(d: LunarDate): string {
  return `${d.day}/${d.month}${d.isLeapMonth ? "N" : ""}`;
}
