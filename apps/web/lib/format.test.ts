import { describe, expect, it } from "vitest";
import { readCookie } from "./api";
import { emptyDateFields, formatAnniversary, formatFlexibleDate, formatPhone, fromDateFields, lifespan, loginLabel, slugify, toDateFields } from "./format";

describe("lifespan", () => {
  it("hiển thị năm sinh – năm mất", () => {
    expect(lifespan({ birthYear: 1920, deathYear: 1990, isLiving: false })).toBe("1920 – 1990");
    expect(lifespan({ birthYear: 1990, isLiving: true })).toBe("sinh 1990");
    expect(lifespan({ birthYear: null, deathYear: 1990, isLiving: false })).toBe("? – 1990");
    expect(lifespan({ birthYear: null, deathYear: null, isLiving: false })).toBe("đã mất");
    expect(lifespan({ birthYear: null, isLiving: true })).toBe("");
  });
});

describe("formatFlexibleDate", () => {
  it("dương lịch theo độ chính xác", () => {
    expect(formatFlexibleDate({ calendar: "solar", precision: "day", year: 1950, month: 3, day: 12 })).toBe("12/3/1950");
    expect(formatFlexibleDate({ calendar: "solar", precision: "month", year: 1950, month: 3 })).toBe("tháng 3/1950");
    expect(formatFlexibleDate({ calendar: "solar", precision: "approx", year: 1950 })).toBe("khoảng 1950");
    expect(formatFlexibleDate(null)).toBe("");
  });
  it("âm lịch có can chi, tháng Giêng, nhuận", () => {
    expect(formatFlexibleDate({ calendar: "lunar", precision: "day", year: 2025, month: 1, day: 1 })).toBe(
      "mùng 1 tháng Giêng năm Ất Tỵ (2025), âm lịch",
    );
    expect(formatFlexibleDate({ calendar: "lunar", precision: "month", year: 2025, month: 6, isLeapMonth: true })).toBe(
      "tháng 6 nhuận năm Ất Tỵ (2025), âm lịch",
    );
  });
  it("ngày giỗ", () => {
    expect(formatAnniversary({ day: 15, month: 12, isLeapMonth: false })).toBe("ngày 15 tháng Chạp (âm lịch)");
    expect(formatAnniversary(null)).toBe("");
  });
});

describe("fromDateFields", () => {
  const f = (o: Partial<ReturnType<typeof emptyDateFields>>) => ({ ...emptyDateFields(), ...o });
  it("bỏ trống → null", () => expect(fromDateFields(f({}))).toBeNull());
  it("chỉ năm / tháng năm / đủ ngày", () => {
    expect(fromDateFields(f({ year: "1945" }))).toEqual({ calendar: "solar", precision: "year", year: 1945 });
    expect(fromDateFields(f({ year: "1945", month: "9" }))).toEqual({ calendar: "solar", precision: "month", year: 1945, month: 9 });
    expect(fromDateFields(f({ year: "1945", month: "9", day: "2" }))).toEqual({
      calendar: "solar",
      precision: "day",
      year: 1945,
      month: 9,
      day: 2,
    });
  });
  it("khoảng năm, âm lịch nhuận", () => {
    expect(fromDateFields(f({ year: "1900", approx: true }))).toEqual({ calendar: "solar", precision: "approx", year: 1900 });
    expect(fromDateFields(f({ calendar: "lunar", year: "2025", month: "6", day: "30", isLeapMonth: true }))).toEqual({
      calendar: "lunar",
      precision: "day",
      year: 2025,
      month: 6,
      day: 30,
      isLeapMonth: true,
    });
  });
  it("báo lỗi dễ hiểu", () => {
    expect(fromDateFields(f({ month: "3" }))).toBe("Cần nhập năm");
    expect(fromDateFields(f({ year: "19a5" }))).toBe("Năm phải là số, ví dụ 1945");
    expect(fromDateFields(f({ year: "1945", day: "2" }))).toBe("Có ngày thì cần nhập tháng");
    expect(fromDateFields(f({ year: "1945", month: "13" }))).toBe("Tháng từ 1 đến 12");
    expect(fromDateFields(f({ year: "1945", month: "2", day: "31", calendar: "lunar" }))).toBe("Ngày từ 1 đến 30");
  });
  it("toDateFields ↔ fromDateFields khứ hồi", () => {
    const d = { calendar: "lunar" as const, precision: "day" as const, year: 1960, month: 4, day: 8, isLeapMonth: true };
    expect(fromDateFields(toDateFields(d))).toEqual(d);
  });
});

describe("readCookie", () => {
  it("đọc đúng cookie, giải mã", () => {
    expect(readCookie("csrf", "sid=abc; csrf=x%3Dy; other=1")).toBe("x=y");
    expect(readCookie("missing", "a=1")).toBeNull();
  });
});

describe("slugify", () => {
  it("bỏ dấu tiếng Việt, đ → d", () => {
    expect(slugify("Họ Nguyễn Đức – Làng Đông Ngạc")).toBe("ho-nguyen-duc-lang-dong-ngac");
    expect(slugify("  !!! ")).toBe("");
  });
});

describe("trang trợ giúp", async () => {
  const { stripForReaders, tableOfContents } = await import("./help");
  it("bỏ frontmatter và ghi chú HTML", () => {
    expect(stripForReaders("---\ntitle: x\n---\n<!-- bí mật -->\n# Tiêu đề\nNội dung")).toBe("# Tiêu đề\nNội dung");
  });
  it("mục lục từ ##, bỏ qua code", () => {
    expect(tableOfContents("# A\n## 1. Đăng nhập\n```\n## không phải\n```\n## **Phả đồ**")).toEqual([
      { id: "1-dang-nhap", title: "1. Đăng nhập" },
      { id: "pha-do", title: "Phả đồ" },
    ]);
  });
});

describe("safeNext", async () => {
  const { safeNext } = await import("./redirect");
  it("chỉ nhận đường dẫn nội bộ", () => {
    expect(safeNext("/moi/abc")).toBe("/moi/abc");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext(null, "/dong-ho")).toBe("/dong-ho");
  });
});

describe("kiểm tra ảnh trước khi tải", async () => {
  const { checkImageFile } = await import("./upload");
  it("nhận ảnh, chặn file khác và file quá lớn", () => {
    expect(checkImageFile({ name: "nha-tho.jpg", type: "image/jpeg", size: 2_000_000 })).toBeNull();
    expect(checkImageFile({ name: "IMG_0001.jpg", type: "", size: 3_000_000 })).toBeNull(); // một số máy không báo type
    expect(checkImageFile({ name: "IMG_0001.HEIC", type: "image/heic", size: 3_000_000 })).toMatch(/HEIC của iPhone/);
    expect(checkImageFile({ name: "gia-pha.pdf", type: "application/pdf", size: 1000 })).toMatch(/không phải ảnh/);
    expect(checkImageFile({ name: "to.jpg", type: "image/jpeg", size: 16 * 1024 * 1024 })).toMatch(/lớn hơn 15 MB/);
  });
});

describe("xem ảnh lớn: quay vòng chỉ số", async () => {
  const { wrapIndex } = await import("../components/lightbox");
  it("lùi từ ảnh đầu về ảnh cuối, tiến từ ảnh cuối về ảnh đầu", () => {
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(1, 3)).toBe(1);
  });
});

describe("Số điện thoại", () => {
  it("hiện số Việt Nam theo cách người dùng quen đọc", () => {
    expect(formatPhone("+84912345678")).toBe("0912 345 678");
    expect(formatPhone("+842438261234")).toBe("02438261234");
    expect(formatPhone("+14155550100")).toBe("+14155550100");
    expect(formatPhone(null)).toBe("");
  });
  it("tên đăng nhập: số điện thoại và/hoặc email", () => {
    expect(loginLabel({ phone: "+84912345678", email: null })).toBe("0912 345 678");
    expect(loginLabel({ phone: null, email: "a@b.vn" })).toBe("a@b.vn");
    expect(loginLabel({ phone: "+84912345678", email: "a@b.vn" })).toBe("0912 345 678 · a@b.vn");
  });
});
