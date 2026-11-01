import { describe, expect, it } from "vitest";
import {
  isValidSolarDate,
  jdToSolar,
  leapMonthOf,
  lunarMonthLength,
  lunarToSolar,
  solarToJd,
  solarToLunar,
} from "../src/index.js";

const s = (day: number, month: number, year: number) => ({ day, month, year });
const l = (day: number, month: number, year: number, isLeapMonth = false) => ({
  day,
  month,
  year,
  isLeapMonth,
});

describe("Tết Nguyên Đán (mùng 1 tháng Giêng)", () => {
  it.each([
    [2024, s(10, 2, 2024)],
    [2025, s(29, 1, 2025)],
    [2026, s(17, 2, 2026)],
  ])("Tết %i", (year, solar) => {
    expect(lunarToSolar(l(1, 1, year))).toEqual(solar);
    expect(solarToLunar(solar)).toEqual(l(1, 1, year));
  });

  it("1985: Tết Việt Nam 21/1 khác Trung Quốc (20/2) vì múi giờ UTC+7", () => {
    expect(lunarToSolar(l(1, 1, 1985))).toEqual(s(21, 1, 1985));
    expect(lunarToSolar(l(1, 1, 1985), 8)).toEqual(s(20, 2, 1985));
  });

  it("2007: Tết Việt Nam 17/2 sớm hơn Trung Quốc (18/2) một ngày", () => {
    expect(lunarToSolar(l(1, 1, 2007))).toEqual(s(17, 2, 2007));
    expect(lunarToSolar(l(1, 1, 2007), 8)).toEqual(s(18, 2, 2007));
  });

  it("Trung thu 2025 (15/8 âm) là 6/10/2025", () => {
    expect(lunarToSolar(l(15, 8, 2025))).toEqual(s(6, 10, 2025));
  });
});

describe("Tháng nhuận", () => {
  it.each([
    [2014, 9],
    [2017, 6],
    [2020, 4],
    [2023, 2],
    [2025, 6],
  ])("năm %i nhuận tháng %i", (year, month) => {
    expect(leapMonthOf(year)).toBe(month);
  });

  it.each([2021, 2022, 2024, 2026])("năm %i không nhuận", (year) => {
    expect(leapMonthOf(year)).toBeNull();
  });

  it("tháng nhuận không tồn tại trả về null", () => {
    expect(lunarToSolar(l(1, 5, 2025, true))).toBeNull();
    expect(lunarToSolar(l(1, 6, 2024, true))).toBeNull();
  });

  it("tháng 6 nhuận năm 2025 nằm ngay sau tháng 6 thường", () => {
    const regular = solarToJd(lunarToSolar(l(1, 6, 2025))!);
    const leap = solarToJd(lunarToSolar(l(1, 6, 2025, true))!);
    const july = solarToJd(lunarToSolar(l(1, 7, 2025))!);
    expect(leap - regular).toBeGreaterThanOrEqual(29);
    expect(leap - regular).toBeLessThanOrEqual(30);
    expect(july - leap).toBeGreaterThanOrEqual(29);
    expect(july - leap).toBeLessThanOrEqual(30);
    expect(solarToLunar(jdToSolar(leap + 3))).toEqual(l(4, 6, 2025, true));
  });
});

describe("Độ dài tháng", () => {
  it("chỉ là 29 hoặc 30, và ngày 30 của tháng thiếu không tồn tại", () => {
    for (let m = 1; m <= 12; m++) {
      const len = lunarMonthLength(m, 2026);
      expect([29, 30]).toContain(len);
      const day30 = lunarToSolar(l(30, m, 2026));
      if (len === 29) expect(day30).toBeNull();
      else expect(day30).not.toBeNull();
    }
  });

  it("một năm âm lịch có 353–355 ngày (thường) hoặc 383–385 ngày (nhuận)", () => {
    for (let y = 1900; y <= 2100; y++) {
      const days =
        solarToJd(lunarToSolar(l(1, 1, y + 1))!) - solarToJd(lunarToSolar(l(1, 1, y))!);
      if (leapMonthOf(y) === null) {
        expect(days).toBeGreaterThanOrEqual(353);
        expect(days).toBeLessThanOrEqual(355);
      } else {
        expect(days).toBeGreaterThanOrEqual(383);
        expect(days).toBeLessThanOrEqual(385);
      }
    }
  });
});

describe("Chuyển đổi hai chiều", () => {
  it("dương → âm → dương khớp cho mọi ngày 1900–2100", () => {
    const start = solarToJd(s(1, 1, 1900));
    const end = solarToJd(s(31, 12, 2100));
    let prev = solarToLunar(jdToSolar(start));
    for (let jd = start; jd <= end; jd++) {
      const solar = jdToSolar(jd);
      const lunar = solarToLunar(solar);
      expect(lunarToSolar(lunar)).toEqual(solar);
      // ngày âm tăng dần 1, hoặc quay về mùng 1
      if (jd > start) {
        if (lunar.day === 1) expect([29, 30]).toContain(prev.day);
        else expect(lunar.day).toBe(prev.day + 1);
      }
      prev = lunar;
    }
  });

  it("hồi quy: 7/5/2054 từng bị đổi thành 'ngày 0' (sóc ước lượng lệch 2 tháng)", () => {
    const lunar = solarToLunar(s(7, 5, 2054));
    expect(lunar.day).toBeGreaterThanOrEqual(1);
    expect(lunarToSolar(lunar)).toEqual(s(7, 5, 2054));
  });

  it("hồi quy: năm 1403 nhuận tháng Chạp — tháng 12 nhuận phải đổi ngược được", () => {
    expect(leapMonthOf(1403)).toBe(12);
    expect(lunarToSolar(l(1, 12, 1403, true))).toEqual(s(13, 1, 1404));
  });

  it("khớp hai chiều trên toàn phạm vi hỗ trợ 1200–2199 (lấy mẫu 5 ngày/lần)", () => {
    const start = solarToJd(s(1, 1, 1200));
    const end = solarToJd(s(31, 12, 2199));
    for (let jd = start; jd <= end; jd += 5) {
      const solar = jdToSolar(jd);
      const lunar = solarToLunar(solar);
      expect(lunar.day).toBeGreaterThanOrEqual(1);
      expect(lunar.day).toBeLessThanOrEqual(30);
      expect(lunarToSolar(lunar)).toEqual(solar);
    }
  });

  it("chạy được với ngày trước 1582 (lịch Julius) trong phạm vi hỗ trợ", () => {
    const lunar = solarToLunar(s(1, 6, 1500));
    expect(lunarToSolar(lunar)).toEqual(s(1, 6, 1500));
  });
});

describe("Kiểm tra đầu vào", () => {
  it("từ chối ngày dương không hợp lệ", () => {
    expect(isValidSolarDate(s(29, 2, 2023))).toBe(false);
    expect(isValidSolarDate(s(29, 2, 2024))).toBe(true);
    expect(isValidSolarDate(s(31, 4, 2024))).toBe(false);
    // 5–14/10/1582 không tồn tại (chuyển từ lịch Julius sang Gregory)
    expect(isValidSolarDate(s(10, 10, 1582))).toBe(false);
    expect(isValidSolarDate(s(4, 10, 1582))).toBe(true);
    expect(isValidSolarDate(s(15, 10, 1582))).toBe(true);
    expect(() => solarToLunar(s(32, 1, 2024))).toThrow(RangeError);
  });

  it("từ chối năm ngoài phạm vi", () => {
    expect(() => lunarToSolar(l(1, 1, 1000))).toThrow(RangeError);
    expect(() => solarToLunar(s(1, 1, 2300))).toThrow(RangeError);
  });

  it("ngày/tháng âm vô lý trả về null", () => {
    expect(lunarToSolar(l(31, 1, 2025))).toBeNull();
    expect(lunarToSolar(l(1, 13, 2025))).toBeNull();
    expect(lunarToSolar(l(0, 1, 2025))).toBeNull();
  });
});
