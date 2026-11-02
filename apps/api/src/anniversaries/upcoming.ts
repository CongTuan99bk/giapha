import {
  anniversariesBetween,
  type AnniversaryAdjustment,
  type Day30Rule,
  jdToSolar,
  type SolarDate,
  solarToJd,
  solarToLunar,
} from "@coinguon/lunar-vn";

/** Người đã mất có ngày giỗ âm lịch (death_anniv_lunar) — một dòng đọc từ DB */
export interface AnniversarySource {
  id: string;
  fullName: string;
  gender: "male" | "female" | "unknown";
  generation: number | null;
  inClan: boolean;
  /** { day, month, isLeapMonth } âm lịch */
  anniv: { day: number; month: number; isLeapMonth?: boolean };
  /** Năm mất theo âm lịch (để tính giỗ lần thứ mấy); null nếu không rõ */
  deathLunarYear: number | null;
  deathYear: number | null;
}

export interface UpcomingAnniversary {
  personId: string;
  fullName: string;
  gender: AnniversarySource["gender"];
  generation: number | null;
  inClan: boolean;
  deathYear: number | null;
  /** Ngày âm lịch thực tế cúng giỗ năm đó */
  lunar: { day: number; month: number; year: number; isLeapMonth: boolean };
  /** "YYYY-MM-DD" */
  solarDate: string;
  /** 0 = Chủ nhật … 6 = Thứ bảy */
  weekday: number;
  daysUntil: number;
  /** Giỗ lần thứ mấy (1 = giỗ đầu, 2 = giỗ hết); null nếu không rõ năm mất */
  nth: number | null;
  adjustments: AnniversaryAdjustment[];
}

export const isoDate = (d: SolarDate) => `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

export function parseIsoDate(s: string): SolarDate {
  const [year, month, day] = s.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

/** Hôm nay theo giờ Việt Nam (máy chủ có thể đặt múi giờ khác) */
export function todayInVietnam(now = new Date()): SolarDate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parseIsoDate(parts);
}

/** Năm mất theo âm lịch: ngày mất ghi âm lịch thì lấy luôn; ghi dương lịch đủ ngày thì đổi sang âm. */
export function deathLunarYearOf(death: unknown): number | null {
  if (!death || typeof death !== "object") return null;
  const d = death as { calendar?: string; year?: number; month?: number; day?: number; precision?: string };
  if (typeof d.year !== "number") return null;
  if (d.calendar === "lunar") return d.year;
  if (d.precision === "day" && d.month && d.day) {
    try {
      return solarToLunar({ year: d.year, month: d.month, day: d.day }).year;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Các ngày giỗ có ngày dương lịch trong [from, from + days - 1], sắp theo ngày.
 * Một người có thể có hai lần giỗ trong khoảng dài hơn một năm.
 */
export function upcomingAnniversaries(
  sources: AnniversarySource[],
  opts: { from: SolarDate; days: number; day30Rule: Day30Rule },
): UpcomingAnniversary[] {
  const fromJd = solarToJd(opts.from);
  const to = jdToSolar(fromJd + opts.days - 1);
  const out: UpcomingAnniversary[] = [];
  for (const s of sources) {
    let list;
    try {
      list = anniversariesBetween(s.anniv, opts.from, to, { day30Rule: opts.day30Rule });
    } catch {
      continue; // dữ liệu ngày giỗ hỏng: bỏ qua người này, không làm hỏng cả lịch
    }
    for (const a of list) {
      const jd = solarToJd(a.solar);
      const nth = s.deathLunarYear !== null ? a.lunarYear - s.deathLunarYear : null;
      out.push({
        personId: s.id,
        fullName: s.fullName,
        gender: s.gender,
        generation: s.generation,
        inClan: s.inClan,
        deathYear: s.deathYear,
        lunar: { day: a.lunar.day, month: a.lunar.month, year: a.lunar.year, isLeapMonth: a.lunar.isLeapMonth },
        solarDate: isoDate(a.solar),
        // 1/1/1970 (JD 2440588) là thứ Năm
        weekday: (((jd - 2440588 + 4) % 7) + 7) % 7,
        daysUntil: jd - fromJd,
        // giỗ trước cả ngày mất (dữ liệu nhập sai năm) thì không ghi lần thứ
        nth: nth !== null && nth >= 1 ? nth : null,
        adjustments: a.adjustments,
      });
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil || a.fullName.localeCompare(b.fullName, "vi"));
}

// ───────── Lịch .ics (RFC 5545) để thêm vào lịch điện thoại ─────────

/** Gập dòng dài 75 octet, thoát ký tự đặc biệt */
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (start === 0 ? 75 : 74), bytes.length);
    // không cắt giữa một ký tự UTF-8 (byte tiếp nối có dạng 10xxxxxx)
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return parts.join("\r\n ");
}

export function toIcs(items: UpcomingAnniversary[], clanName: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gia Pha Coi Nguon//Lich gio//VI",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsText(`Lịch giỗ ${clanName}`)}`,
  ];
  for (const a of items) {
    const day = a.solarDate.replace(/-/g, "");
    const next = isoDate(jdToSolar(solarToJd(parseIsoDate(a.solarDate)) + 1)).replace(/-/g, "");
    const lunar = `${a.lunar.day}/${a.lunar.month} âm lịch`;
    const nth = a.nth === 1 ? " — giỗ đầu" : a.nth === 2 ? " — giỗ hết" : a.nth ? ` — giỗ lần thứ ${a.nth}` : "";
    lines.push(
      "BEGIN:VEVENT",
      `UID:gio-${a.personId}-${a.lunar.year}@giapha-coinguon`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${icsText(`Giỗ ${a.fullName} (${lunar})`)}`,
      `DESCRIPTION:${icsText(`${clanName}. Ngày ${lunar}${nth}.`)}`,
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsText(`Sắp đến giỗ ${a.fullName}`)}`,
      "TRIGGER:-P3D",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
