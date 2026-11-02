import { describe, expect, it } from "vitest";
import {
  clanSlugSchema,
  contactInputSchema,
  dailyRangeSchema,
  defaultPrivacy,
  deviceTypeOf,
  flexibleDateSchema,
  heartbeatSchema,
  isBotUserAgent,
  loginIdSchema,
  normalizePhone,
  parseLoginId,
  maskEmail,
  normalizeVnPhone,
  pageViewSchema,
  personCreateSchema,
  personUpdateSchema,
  statDateVN,
  toPublicContact,
} from "../src/index.js";

const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const UA_ZALO_INAPP =
  "Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 Zalo android/12100519 ZaloTheme/light";

describe("Đăng nhập bằng email hoặc số điện thoại", () => {
  it("nhận số Việt Nam ở nhiều cách viết và số quốc tế có dấu +", () => {
    expect(parseLoginId("0912 345 678")).toEqual({ phone: "+84912345678" });
    expect(parseLoginId("84912345678")).toEqual({ phone: "+84912345678" });
    expect(normalizePhone("+1 (415) 555-0100")).toBe("+14155550100");
    expect(normalizePhone("+84 123")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
  });
  it("có @ thì là email (chữ thường)", () => {
    expect(parseLoginId(" An@Example.COM ")).toEqual({ email: "an@example.com" });
    expect(parseLoginId("an@")).toBeNull();
  });
  it("báo lỗi dễ hiểu", () => {
    const r = loginIdSchema.safeParse("0912");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toContain("Số điện thoại không hợp lệ");
    expect(loginIdSchema.safeParse("").error?.issues[0]?.message).toBe("Nhập email hoặc số điện thoại");
  });
});

describe("Số điện thoại, email", () => {
  it("chuẩn hoá số Việt Nam về +84", () => {
    expect(normalizeVnPhone("0912 345 678")).toBe("+84912345678");
    expect(normalizeVnPhone("+84 912.345.678")).toBe("+84912345678");
    expect(normalizeVnPhone("024 3826 1234")).toBe("+842438261234");
    expect(normalizeVnPhone("0123")).toBeNull();
    expect(normalizeVnPhone("0112345678")).toBeNull();
  });
  it("che email (BR-PRIV-05)", () => {
    expect(maskEmail("nguyenvana@gmail.com")).toBe("ng***@gmail.com");
    expect(maskEmail("ab@x.vn")).toBe("a***@x.vn");
    expect(maskEmail("khong-hop-le")).toBe("***");
  });
});

describe("Ngày tháng linh hoạt", () => {
  it("chấp nhận chỉ năm, ngày âm lịch có tháng nhuận", () => {
    expect(flexibleDateSchema.safeParse({ calendar: "solar", precision: "year", year: 1890 }).success).toBe(true);
    expect(
      flexibleDateSchema.safeParse({ calendar: "lunar", precision: "day", year: 1945, month: 7, day: 15, isLeapMonth: true }).success,
    ).toBe(true);
  });
  it("từ chối dữ liệu mâu thuẫn", () => {
    expect(flexibleDateSchema.safeParse({ calendar: "solar", precision: "day", year: 1945 }).success).toBe(false);
    expect(flexibleDateSchema.safeParse({ calendar: "lunar", precision: "day", year: 1945, month: 1, day: 31 }).success).toBe(false);
    expect(flexibleDateSchema.safeParse({ calendar: "solar", precision: "month", year: 1945, month: 2, isLeapMonth: true }).success).toBe(false);
  });
});

describe("Người", () => {
  it("tạo mới áp giá trị mặc định", () => {
    const p = personCreateSchema.parse({ fullName: "  Nguyễn Văn A " });
    expect(p).toMatchObject({ fullName: "Nguyễn Văn A", gender: "unknown", isLiving: true, otherNames: [] });
  });
  it("người còn sống không có ngày mất", () => {
    const r = personCreateSchema.safeParse({
      fullName: "A",
      isLiving: true,
      deathDate: { calendar: "solar", precision: "year", year: 2000 },
    });
    expect(r.success).toBe(false);
  });
  it("sửa bắt buộc có version và không tự thêm giá trị mặc định (BR-TREE-07)", () => {
    expect(personUpdateSchema.safeParse({ fullName: "B" }).success).toBe(false);
    const u = personUpdateSchema.parse({ fullName: "B", version: 3 });
    expect(u).toEqual({ fullName: "B", version: 3 });
    expect(personUpdateSchema.safeParse({ version: 1, khongCo: 1 }).success).toBe(false);
  });
  it("riêng tư mặc định (BR-PRIV-01)", () => {
    expect(defaultPrivacy(true)).toBe("members");
    expect(defaultPrivacy(false)).toBe("public");
  });
});

describe("Slug dòng họ", () => {
  it.each(["ho-nguyen", "nguyen-van-ha-tinh", "ho123"])("hợp lệ: %s", (s) => {
    expect(clanSlugSchema.safeParse(s).success).toBe(true);
  });
  it.each(["ab", "-ho", "ho-", "họ-nguyễn", "ho--nguyen", "www", "api"])("không hợp lệ: %s", (s) => {
    expect(clanSlugSchema.safeParse(s).success).toBe(false);
  });
});

describe("Liên hệ ban quản lý (BR-PRIV-04, 05)", () => {
  const base = {
    name: "Nguyễn Văn A",
    role: "Trưởng ban liên lạc",
    phone: "+84912345678",
    email: "nguyenvana@gmail.com",
    zalo: "+84912345678",
    photoUrl: "https://example/a.jpg",
  };

  it("chưa đồng ý → chỉ hiện tên, vai trò, form liên hệ", () => {
    const v = toPublicContact({ ...base, publicFields: ["phone", "email", "zalo", "photo"], consentAt: null });
    expect(v).toMatchObject({ phone: null, emailMasked: null, zalo: null, photoUrl: null, contactFormOnly: true });
    expect(v.name).toBe("Nguyễn Văn A");
  });

  it("đã đồng ý → chỉ hiện trường được bật; email luôn che", () => {
    const v = toPublicContact({ ...base, publicFields: ["phone", "email"], consentAt: new Date() });
    expect(v.phone).toBe("+84912345678");
    expect(v.emailMasked).toBe("ng***@gmail.com");
    expect(v.zalo).toBeNull();
    expect(v.photoUrl).toBeNull();
    expect(v.contactFormOnly).toBe(false);
  });

  it("không cho bật công khai trường đang trống", () => {
    const r = contactInputSchema.safeParse({ name: "A", role: "Thủ quỹ", publicFields: ["phone"] });
    expect(r.success).toBe(false);
    const ok = contactInputSchema.parse({ name: "A", role: "Thủ quỹ", phone: "0912345678", publicFields: ["phone"] });
    expect(ok.phone).toBe("+84912345678");
  });
});

describe("Thống kê truy cập", () => {
  it("heartbeat bỏ query string khỏi đường dẫn", () => {
    const hb = heartbeatSchema.parse({ h: "ho-nguyen.coinguon.vn", v: "a7f3c9e1b2x", p: "/pha-do?ma=1234#x" });
    expect(hb.p).toBe("/pha-do");
    expect(hb.m).toBe(0);
  });
  it("từ chối visitor id lạ", () => {
    expect(heartbeatSchema.safeParse({ h: "a.vn", v: "<script>", p: "/" }).success).toBe(false);
  });
  it("page view chỉ giữ tên miền nguồn", () => {
    const pv = pageViewSchema.parse({ h: "a.vn", v: "abcdefghij", p: "/", r: "https://www.facebook.com/groups/123?x=1" });
    expect(pv.r).toBe("facebook.com");
  });
  it("nhận diện bot nhưng không chặn người xem trong app Zalo (BR-STAT-05)", () => {
    expect(isBotUserAgent("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(true);
    expect(isBotUserAgent("facebookexternalhit/1.1")).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
    expect(isBotUserAgent(UA_IPHONE)).toBe(false);
    expect(isBotUserAgent(UA_ZALO_INAPP)).toBe(false);
  });
  it("phân loại thiết bị", () => {
    expect(deviceTypeOf(UA_IPHONE)).toBe("mobile");
    expect(deviceTypeOf(UA_ZALO_INAPP)).toBe("mobile");
    expect(deviceTypeOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
    expect(deviceTypeOf("Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 Safari/537.36")).toBe("tablet");
    expect(deviceTypeOf("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Mobile/15E148")).toBe("tablet");
  });
  it("ngày thống kê theo giờ Việt Nam: 23:59 và 00:01 là hai ngày (TC-STAT-04)", () => {
    expect(statDateVN(new Date("2026-11-01T16:59:00Z"))).toBe("2026-11-01"); // 23:59 VN
    expect(statDateVN(new Date("2026-11-01T17:01:00Z"))).toBe("2026-11-02"); // 00:01 VN
  });
  it("khoảng ngày tối đa 366 ngày", () => {
    expect(dailyRangeSchema.safeParse({ from: "2026-01-01", to: "2026-12-31" }).success).toBe(true);
    expect(dailyRangeSchema.safeParse({ from: "2026-02-01", to: "2026-01-01" }).success).toBe(false);
    expect(dailyRangeSchema.safeParse({ from: "2024-01-01", to: "2026-01-01" }).success).toBe(false);
  });
});
