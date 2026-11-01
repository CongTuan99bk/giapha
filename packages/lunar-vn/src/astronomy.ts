/**
 * Tính toán thiên văn cho âm lịch Việt Nam.
 *
 * Cài đặt lại từ mô tả thuật toán đã công bố của Hồ Ngọc Đức
 * ("Âm lịch Việt Nam", https://www.informatik.uni-leipzig.de/~duc/amlich/calrules.html),
 * dựa trên công thức trong "Astronomical Algorithms" (Jean Meeus).
 *
 * Mọi hàm ở đây là hàm thuần (pure), không phụ thuộc múi giờ của máy chạy.
 * Nội bộ dùng số ngày Julius (JDN) để tránh lỗi múi giờ của đối tượng Date.
 */

const PI = Math.PI;
const DEG = PI / 180;

/** Phần nguyên (floor) — giữ đúng ngữ nghĩa INT() của thuật toán gốc với số âm. */
export const int = (x: number): number => Math.floor(x);

/** Ngày dương lịch → số ngày Julius. Trước 15/10/1582 dùng lịch Julius. */
export function jdFromDate(dd: number, mm: number, yy: number): number {
  const a = int((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + int((153 * m + 2) / 5) + 365 * y + int(y / 4) - int(y / 100) + int(y / 400) - 32045;
  if (jd < 2299161) {
    jd = dd + int((153 * m + 2) / 5) + 365 * y + int(y / 4) - 32083;
  }
  return jd;
}

/** Số ngày Julius → ngày dương lịch [ngày, tháng, năm]. */
export function jdToDate(jd: number): [number, number, number] {
  let b: number;
  let c: number;
  if (jd > 2299160) {
    const a = jd + 32044;
    b = int((4 * a + 3) / 146097);
    c = a - int((b * 146097) / 4);
  } else {
    b = 0;
    c = jd + 32082;
  }
  const d = int((4 * c + 3) / 1461);
  const e = c - int((1461 * d) / 4);
  const m = int((5 * e + 2) / 153);
  const day = e - int((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * int(m / 10);
  const year = b * 100 + d - 4800 + int(m / 10);
  return [day, month, year];
}

/** Thời điểm (JD, giờ UT) của lần sóc thứ k tính từ sóc ngày 1/1/1900. */
export function newMoon(k: number): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * DEG);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let c1 = (0.1734 - 0.000393 * T) * Math.sin(M * DEG) + 0.0021 * Math.sin(2 * DEG * M);
  c1 = c1 - 0.4068 * Math.sin(Mpr * DEG) + 0.0161 * Math.sin(DEG * 2 * Mpr);
  c1 = c1 - 0.0004 * Math.sin(DEG * 3 * Mpr);
  c1 = c1 + 0.0104 * Math.sin(DEG * 2 * F) - 0.0051 * Math.sin(DEG * (M + Mpr));
  c1 = c1 - 0.0074 * Math.sin(DEG * (M - Mpr)) + 0.0004 * Math.sin(DEG * (2 * F + M));
  c1 = c1 - 0.0004 * Math.sin(DEG * (2 * F - M)) - 0.0006 * Math.sin(DEG * (2 * F + Mpr));
  c1 = c1 + 0.001 * Math.sin(DEG * (2 * F - Mpr)) + 0.0005 * Math.sin(DEG * (2 * Mpr + M));
  const deltaT =
    T < -11
      ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
      : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return jd1 + c1 - deltaT;
}

/** Kinh độ mặt trời (radian, 0..2π) tại thời điểm JD (giờ UT). */
export function sunLongitude(jdn: number): number {
  const T = (jdn - 2451545.0) / 36525;
  const T2 = T * T;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(DEG * M);
  DL = DL + (0.019993 - 0.000101 * T) * Math.sin(DEG * 2 * M) + 0.00029 * Math.sin(DEG * 3 * M);
  let L = (L0 + DL) * DEG;
  L = L - PI * 2 * int(L / (PI * 2));
  return L;
}

/** Cung hoàng đạo (0..11) của mặt trời lúc 0h ngày `dayNumber` theo múi giờ `tz`. */
export function sunSector(dayNumber: number, tz: number): number {
  return int((sunLongitude(dayNumber - 0.5 - tz / 24) / PI) * 6);
}

/** Ngày (JDN, theo múi giờ `tz`) chứa sóc thứ k. */
export function newMoonDay(k: number, tz: number): number {
  return int(newMoon(k) + 0.5 + tz / 24);
}

/** Ngày bắt đầu tháng 11 âm lịch (tháng chứa Đông chí) của năm dương `yy`. */
export function lunarMonth11(yy: number, tz: number): number {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = int(off / 29.530588853);
  let nm = newMoonDay(k, tz);
  if (sunSector(nm, tz) >= 9) {
    nm = newMoonDay(k - 1, tz);
  }
  return nm;
}

/**
 * Vị trí tháng nhuận tính từ tháng 11 (a11): tháng đầu tiên sau a11
 * không chứa trung khí nào.
 */
export function leapMonthOffset(a11: number, tz: number): number {
  const k = int((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last: number;
  let i = 1;
  let arc = sunSector(newMoonDay(k + i, tz), tz);
  do {
    last = arc;
    i++;
    arc = sunSector(newMoonDay(k + i, tz), tz);
  } while (arc !== last && i < 14);
  return i - 1;
}
