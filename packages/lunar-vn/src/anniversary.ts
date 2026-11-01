import { jdToSolar, lunarMonthLength, lunarToSolar, solarToJd, solarToLunar } from "./calendar.js";
import { VN_TIMEZONE, type LunarDate, type SolarDate } from "./types.js";

/**
 * Cách xử lý khi người mất ngày 30 mà năm cúng giỗ tháng đó chỉ có 29 ngày (BR-LUNAR-04).
 * - `day29`: giỗ ngày 29 (mặc định, phổ biến nhất)
 * - `nextMonthDay1`: giỗ ngày mùng 1 tháng kế tiếp
 */
export type Day30Rule = "day29" | "nextMonthDay1";

export interface AnniversaryOptions {
  day30Rule?: Day30Rule;
  tz?: number;
}

/** Ngày mất âm lịch dùng để tính giỗ (chỉ cần ngày, tháng; năm không ảnh hưởng). */
export interface DeathLunarDate {
  day: number;
  month: number;
  isLeapMonth?: boolean;
}

export type AnniversaryAdjustment =
  /** Mất vào tháng nhuận → giỗ tháng thường cùng số (BR-LUNAR-03) */
  | "leap-month-to-regular"
  /** Mất ngày 30, năm nay tháng thiếu → ngày 29 */
  | "day30-to-day29"
  /** Mất ngày 30, năm nay tháng thiếu → mùng 1 tháng sau */
  | "day30-to-next-month";

export interface Anniversary {
  /** Năm âm lịch của lần giỗ */
  lunarYear: number;
  /** Ngày âm lịch thực tế cúng giỗ */
  lunar: LunarDate;
  /** Ngày dương lịch tương ứng */
  solar: SolarDate;
  adjustments: AnniversaryAdjustment[];
}

function assertDeathDate(d: DeathLunarDate): void {
  if (!Number.isInteger(d.day) || d.day < 1 || d.day > 30) {
    throw new RangeError(`Ngày âm lịch không hợp lệ: ${d.day}`);
  }
  if (!Number.isInteger(d.month) || d.month < 1 || d.month > 12) {
    throw new RangeError(`Tháng âm lịch không hợp lệ: ${d.month}`);
  }
}

/** Tính ngày giỗ trong năm âm lịch `lunarYear` (BR-LUNAR-02..04). */
export function deathAnniversary(
  death: DeathLunarDate,
  lunarYear: number,
  options: AnniversaryOptions = {},
): Anniversary {
  assertDeathDate(death);
  const tz = options.tz ?? VN_TIMEZONE;
  const rule = options.day30Rule ?? "day29";
  const adjustments: AnniversaryAdjustment[] = [];
  if (death.isLeapMonth) adjustments.push("leap-month-to-regular");

  const { month } = death;
  let day = death.day;
  const length = lunarMonthLength(month, lunarYear, false, tz);
  if (length === null) {
    /* c8 ignore next — tháng thường luôn tồn tại */
    throw new Error(`Tháng ${month} năm ${lunarYear} không tồn tại`);
  }

  if (day === 30 && length === 29) {
    if (rule === "nextMonthDay1") {
      const day29 = lunarToSolar({ day: 29, month, year: lunarYear, isLeapMonth: false }, tz)!;
      const solar = jdToSolar(solarToJd(day29) + 1);
      adjustments.push("day30-to-next-month");
      return { lunarYear, lunar: solarToLunar(solar, tz), solar, adjustments };
    }
    day = 29;
    adjustments.push("day30-to-day29");
  }

  const lunar: LunarDate = { day, month, year: lunarYear, isLeapMonth: false };
  const solar = lunarToSolar(lunar, tz)!;
  return { lunarYear, lunar, solar, adjustments };
}

/**
 * Các ngày giỗ có ngày dương lịch nằm trong khoảng [from, to] (gồm cả hai đầu).
 * Dùng cho job sinh lịch sự kiện hằng năm.
 */
export function anniversariesBetween(
  death: DeathLunarDate,
  from: SolarDate,
  to: SolarDate,
  options: AnniversaryOptions = {},
): Anniversary[] {
  const fromJd = solarToJd(from);
  const toJd = solarToJd(to);
  if (toJd < fromJd) return [];
  const result: Anniversary[] = [];
  for (let y = from.year - 1; y <= to.year + 1; y++) {
    const a = deathAnniversary(death, y, options);
    const jd = solarToJd(a.solar);
    if (jd >= fromJd && jd <= toJd) result.push(a);
  }
  return result;
}
