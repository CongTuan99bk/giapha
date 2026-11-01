import { describe, expect, it } from "vitest";
import {
  anniversariesBetween,
  canChiOfDay,
  canChiOfYear,
  deathAnniversary,
  formatLunarDate,
  formatLunarShort,
  lunarMonthLength,
  lunarToSolar,
  solarToJd,
} from "../src/index.js";

/** Tìm (tháng, năm) mà tháng âm đó có 29 ngày — dùng để kiểm tra luật ngày 30. */
function findShortMonth(fromYear: number): { month: number; year: number } {
  for (let y = fromYear; y < fromYear + 5; y++) {
    for (let m = 1; m <= 12; m++) {
      if (lunarMonthLength(m, y) === 29) return { month: m, year: y };
    }
  }
  throw new Error("không tìm thấy");
}

describe("Ngày giỗ (BR-LUNAR-02..04)", () => {
  it("giỗ = cùng ngày, tháng âm lịch hằng năm", () => {
    const a = deathAnniversary({ day: 15, month: 8 }, 2025);
    expect(a.lunar).toEqual({ day: 15, month: 8, year: 2025, isLeapMonth: false });
    expect(a.solar).toEqual({ day: 6, month: 10, year: 2025 });
    expect(a.adjustments).toEqual([]);
  });

  it("mất trong tháng nhuận → giỗ tháng thường cùng số (BR-LUNAR-03)", () => {
    const a = deathAnniversary({ day: 10, month: 6, isLeapMonth: true }, 2026);
    expect(a.lunar).toEqual({ day: 10, month: 6, year: 2026, isLeapMonth: false });
    expect(a.adjustments).toContain("leap-month-to-regular");
    // ngay cả năm có tháng 6 nhuận cũng giỗ tháng 6 thường
    const b = deathAnniversary({ day: 10, month: 6, isLeapMonth: true }, 2025);
    expect(b.lunar.isLeapMonth).toBe(false);
    expect(b.solar).toEqual(lunarToSolar({ day: 10, month: 6, year: 2025, isLeapMonth: false }));
  });

  it("mất ngày 30, năm nay tháng thiếu → ngày 29 (mặc định, BR-LUNAR-04)", () => {
    const { month, year } = findShortMonth(2026);
    const a = deathAnniversary({ day: 30, month }, year);
    expect(a.lunar.day).toBe(29);
    expect(a.adjustments).toContain("day30-to-day29");
  });

  it("mất ngày 30, năm nay tháng thiếu, dòng họ chọn 'mùng 1 tháng sau'", () => {
    const { month, year } = findShortMonth(2026);
    const a = deathAnniversary({ day: 30, month }, year, { day30Rule: "nextMonthDay1" });
    expect(a.lunar.day).toBe(1);
    const day29 = lunarToSolar({ day: 29, month, year, isLeapMonth: false })!;
    expect(solarToJd(a.solar) - solarToJd(day29)).toBe(1);
    expect(a.adjustments).toContain("day30-to-next-month");
  });

  it("mất ngày 30, năm nay tháng đủ → giữ ngày 30", () => {
    for (let m = 1; m <= 12; m++) {
      if (lunarMonthLength(m, 2026) === 30) {
        expect(deathAnniversary({ day: 30, month: m }, 2026).lunar.day).toBe(30);
        return;
      }
    }
  });

  it("từ chối ngày tháng vô lý", () => {
    expect(() => deathAnniversary({ day: 31, month: 1 }, 2025)).toThrow(RangeError);
    expect(() => deathAnniversary({ day: 1, month: 0 }, 2025)).toThrow(RangeError);
  });
});

describe("anniversariesBetween — cho job sinh lịch sự kiện", () => {
  it("trả đúng 1 lần giỗ mỗi năm dương trong khoảng 2 năm", () => {
    const list = anniversariesBetween(
      { day: 3, month: 2 },
      { day: 1, month: 1, year: 2026 },
      { day: 31, month: 12, year: 2027 },
    );
    expect(list).toHaveLength(2);
    expect(list.map((a) => a.lunarYear)).toEqual([2026, 2027]);
  });

  it("giỗ tháng Chạp có thể rơi vào năm dương kế tiếp", () => {
    const list = anniversariesBetween(
      { day: 25, month: 12 },
      { day: 1, month: 1, year: 2026 },
      { day: 31, month: 12, year: 2026 },
    );
    for (const a of list) expect(a.solar.year).toBe(2026);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it("khoảng ngược trả về rỗng", () => {
    expect(
      anniversariesBetween(
        { day: 1, month: 1 },
        { day: 1, month: 1, year: 2027 },
        { day: 1, month: 1, year: 2026 },
      ),
    ).toEqual([]);
  });
});

describe("Định dạng", () => {
  it("can chi năm", () => {
    expect(canChiOfYear(2024)).toBe("Giáp Thìn");
    expect(canChiOfYear(2025)).toBe("Ất Tỵ");
    expect(canChiOfYear(2026)).toBe("Bính Ngọ");
    expect(canChiOfYear(1945)).toBe("Ất Dậu");
  });

  it("can chi ngày lặp lại sau 60 ngày", () => {
    // 1/1/2026 + 60 ngày = 2/3/2026
    const d1 = canChiOfDay({ day: 1, month: 1, year: 2026 });
    expect(canChiOfDay({ day: 2, month: 3, year: 2026 })).toBe(d1);
    expect(canChiOfDay({ day: 2, month: 1, year: 2026 })).not.toBe(d1);
  });

  it("ngày âm dạng chữ", () => {
    expect(formatLunarDate({ day: 1, month: 1, year: 2025, isLeapMonth: false })).toBe(
      "mùng 1 tháng Giêng năm Ất Tỵ",
    );
    expect(formatLunarDate({ day: 15, month: 6, year: 2025, isLeapMonth: true })).toBe(
      "ngày 15 tháng 6 nhuận năm Ất Tỵ",
    );
    expect(formatLunarDate({ day: 23, month: 12, year: 2025, isLeapMonth: false })).toBe(
      "ngày 23 tháng Chạp năm Ất Tỵ",
    );
    expect(formatLunarShort({ day: 15, month: 6, year: 2025, isLeapMonth: true })).toBe("15/6N");
  });
});
