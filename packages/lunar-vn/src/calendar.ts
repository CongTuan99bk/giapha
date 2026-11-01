import {
  int,
  jdFromDate,
  jdToDate,
  leapMonthOffset,
  lunarMonth11,
  newMoonDay,
} from "./astronomy.js";
import { MAX_YEAR, MIN_YEAR, VN_TIMEZONE, type LunarDate, type SolarDate } from "./types.js";

const SYNODIC = 29.530588853;
const EPOCH = 2415021.076998695;

/**
 * Năm âm lịch hợp lệ: MIN_YEAR - 1 .. MAX_YEAR — những ngày đầu tháng 1 dương lịch
 * của năm MIN_YEAR vẫn thuộc năm âm lịch MIN_YEAR - 1.
 */
function assertLunarYear(year: number): void {
  if (!Number.isInteger(year) || year < MIN_YEAR - 1 || year > MAX_YEAR) {
    throw new RangeError(`Năm ${year} nằm ngoài khoảng hỗ trợ ${MIN_YEAR}–${MAX_YEAR}`);
  }
}

/** Số ngày trong tháng dương lịch (tính cả lịch Julius trước 1582). */
export function solarMonthLength(month: number, year: number): number {
  const next = month === 12 ? jdFromDate(1, 1, year + 1) : jdFromDate(1, month + 1, year);
  return next - jdFromDate(1, month, year);
}

/** Kiểm tra ngày dương lịch hợp lệ. */
export function isValidSolarDate(d: SolarDate): boolean {
  if (![d.day, d.month, d.year].every(Number.isInteger)) return false;
  if (d.month < 1 || d.month > 12 || d.day < 1) return false;
  if (d.year < MIN_YEAR || d.year > MAX_YEAR || d.day > 31) return false;
  // Đổi qua lại số ngày Julius: loại được cả ngày 5–14/10/1582 (không tồn tại khi chuyển lịch)
  const [day, month, year] = jdToDate(jdFromDate(d.day, d.month, d.year));
  return day === d.day && month === d.month && year === d.year;
}

/** Ngày dương lịch → số ngày Julius. */
export function solarToJd(d: SolarDate): number {
  return jdFromDate(d.day, d.month, d.year);
}

/** Số ngày Julius → ngày dương lịch. */
export function jdToSolar(jd: number): SolarDate {
  const [day, month, year] = jdToDate(jd);
  return { day, month, year };
}

/** Chuyển ngày dương lịch sang âm lịch Việt Nam. */
export function solarToLunar(date: SolarDate, tz: number = VN_TIMEZONE): LunarDate {
  if (!isValidSolarDate(date)) {
    throw new RangeError(`Ngày dương lịch không hợp lệ: ${date.day}/${date.month}/${date.year}`);
  }
  const dayNumber = jdFromDate(date.day, date.month, date.year);
  // Ngày sóc gần nhất không sau dayNumber. Thuật toán gốc chỉ lùi 1 bước,
  // có trường hợp hiếm (ví dụ 7/5/2054) sóc ước lượng vẫn sau ngày cần đổi → lùi tiếp.
  let k = int((dayNumber - EPOCH) / SYNODIC) + 1;
  let monthStart = newMoonDay(k, tz);
  while (monthStart > dayNumber) {
    k--;
    monthStart = newMoonDay(k, tz);
  }
  let a11 = lunarMonth11(date.year, tz);
  let b11 = a11;
  let lunarYear: number;
  if (a11 >= monthStart) {
    lunarYear = date.year;
    a11 = lunarMonth11(date.year - 1, tz);
  } else {
    lunarYear = date.year + 1;
    b11 = lunarMonth11(date.year + 1, tz);
  }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = int((monthStart - a11) / 29);
  let isLeapMonth = false;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const leapDiff = leapMonthOffset(a11, tz);
    if (diff >= leapDiff) {
      lunarMonth = diff + 10;
      if (diff === leapDiff) isLeapMonth = true;
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return { day: lunarDay, month: lunarMonth, year: lunarYear, isLeapMonth };
}

/** JDN của ngày đầu tháng âm lịch, hoặc null nếu tháng nhuận không tồn tại. */
function lunarMonthStartJd(
  month: number,
  year: number,
  isLeapMonth: boolean,
  tz: number,
): number | null {
  let a11: number;
  let b11: number;
  if (month < 11) {
    a11 = lunarMonth11(year - 1, tz);
    b11 = lunarMonth11(year, tz);
  } else {
    a11 = lunarMonth11(year, tz);
    b11 = lunarMonth11(year + 1, tz);
  }
  const k = int(0.5 + (a11 - EPOCH) / SYNODIC);
  let off = month - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365) {
    const leapOff = leapMonthOffset(a11, tz);
    // Tháng nhuận mang số của tháng đứng ngay trước nó (vị trí leapOff - 1 tính từ tháng 11).
    // Công thức gốc `leapOff - 2` cho ra 0 khi nhuận sau tháng Chạp (ví dụ năm 1403) → sửa lại.
    const leapMonth = ((leapOff - 1 + 10) % 12) + 1;
    if (isLeapMonth && month !== leapMonth) return null;
    if (isLeapMonth || off >= leapOff) off += 1;
  } else if (isLeapMonth) {
    return null;
  }
  return newMoonDay(k + off, tz);
}

/** Số ngày của một tháng âm lịch (29 hoặc 30), null nếu tháng không tồn tại. */
export function lunarMonthLength(
  month: number,
  year: number,
  isLeapMonth = false,
  tz: number = VN_TIMEZONE,
): 29 | 30 | null {
  assertLunarYear(year);
  const start = lunarMonthStartJd(month, year, isLeapMonth, tz);
  if (start === null) return null;
  return nextNewMoonDay(start, tz) - start === 30 ? 30 : 29;
}

/** Ngày sóc đầu tiên sau `jd` (tức ngày đầu tháng âm kế tiếp). */
function nextNewMoonDay(jd: number, tz: number): number {
  const k0 = int((jd - EPOCH) / SYNODIC);
  for (let k = k0 - 1; k <= k0 + 3; k++) {
    const nm = newMoonDay(k, tz);
    if (nm > jd) return nm;
  }
  /* c8 ignore next */
  throw new Error("Không tìm được ngày sóc kế tiếp");
}

/**
 * Chuyển ngày âm lịch sang dương lịch.
 * Trả về null nếu ngày không tồn tại (tháng nhuận sai, ngày 30 của tháng thiếu).
 */
export function lunarToSolar(lunar: LunarDate, tz: number = VN_TIMEZONE): SolarDate | null {
  const { day, month, year, isLeapMonth } = lunar;
  assertLunarYear(year);
  if (!Number.isInteger(day) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 30) return null;
  const start = lunarMonthStartJd(month, year, isLeapMonth, tz);
  if (start === null) return null;
  if (day === 30 && lunarMonthLength(month, year, isLeapMonth, tz) !== 30) return null;
  return jdToSolar(start + day - 1);
}

/** Tháng nhuận của năm âm lịch (1–12), hoặc null nếu năm không nhuận. */
export function leapMonthOf(year: number, tz: number = VN_TIMEZONE): number | null {
  assertLunarYear(year);
  for (let m = 1; m <= 12; m++) {
    if (lunarMonthStartJd(m, year, true, tz) !== null) return m;
  }
  return null;
}
