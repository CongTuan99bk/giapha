/** Múi giờ Việt Nam (UTC+7) — mặc định cho mọi phép tính âm lịch. */
export const VN_TIMEZONE = 7;

/** Năm nhỏ nhất/lớn nhất được hỗ trợ (độ chính xác thuật toán giảm ngoài khoảng này). */
export const MIN_YEAR = 1200;
export const MAX_YEAR = 2199;

export interface SolarDate {
  day: number;
  /** 1–12 */
  month: number;
  year: number;
}

export interface LunarDate {
  /** 1–30 */
  day: number;
  /** 1–12 */
  month: number;
  /** Năm âm lịch (năm dương lịch tương ứng tháng Giêng) */
  year: number;
  isLeapMonth: boolean;
}
