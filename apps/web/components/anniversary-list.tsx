import Link from "next/link";
import { lunarMonthName } from "@coinguon/lunar-vn";
import type { UpcomingAnniversary } from "@/lib/types";

export const WEEKDAY = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"] as const;

/** "mùng 1 tháng Giêng", "ngày 12 tháng Ba" */
export function lunarDayText(l: UpcomingAnniversary["lunar"]): string {
  return `${l.day <= 10 ? "mùng" : "ngày"} ${l.day} tháng ${lunarMonthName(l.month)}`;
}

/** Giỗ đầu (tiểu tường), giỗ hết (đại tường), sau đó là giỗ thường */
export function nthText(nth: number | null): string | null {
  if (nth === 1) return "Giỗ đầu";
  if (nth === 2) return "Giỗ hết";
  return nth ? `Giỗ lần thứ ${nth}` : null;
}

export function countdownText(days: number): string {
  if (days === 0) return "Hôm nay";
  if (days === 1) return "Ngày mai";
  if (days === 2) return "Ngày kia";
  return `Còn ${days} ngày`;
}

/**
 * Ô ngày kiểu tờ lịch bloc treo tường: dải son có tháng, số ngày dương lớn, thứ,
 * ngày âm nhỏ ở dưới — thứ người Việt quen nhìn mỗi sáng.
 */
export function CalendarLeaf({ a, size = "md" }: { a: UpcomingAnniversary; size?: "sm" | "md" }) {
  const [, m, d] = a.solarDate.split("-").map(Number) as [number, number, number];
  const sunday = a.weekday === 0;
  return (
    <div
      className={`flex shrink-0 flex-col overflow-hidden rounded-[3px] border border-[#d6c9ae] bg-the text-center shadow-[0_1px_0_rgb(90_67_48/0.15)] ${size === "sm" ? "w-14" : "w-[4.5rem]"}`}
      aria-hidden
    >
      <span className="bg-son-dam py-0.5 text-[0.7rem] font-medium text-thep-nhat">Tháng {m}</span>
      <span className={`font-serif leading-none ${size === "sm" ? "pt-1 text-[1.6rem]" : "pt-1.5 text-[2.1rem]"} ${sunday ? "text-son" : "text-then"}`}>{d}</span>
      <span className={`text-[0.68rem] ${sunday ? "text-son" : "text-reu"}`}>{WEEKDAY[a.weekday]}</span>
      <span className="mb-1 mt-0.5 border-t border-dotted border-[#d6c9ae] pt-0.5 text-[0.68rem] tabular-nums text-thep-dam">
        {a.lunar.day}/{a.lunar.month} âm
      </span>
    </div>
  );
}

/** Một dòng giỗ: tờ lịch, tên (mở trên phả đồ), giỗ lần thứ, còn bao nhiêu ngày */
export function AnniversaryRow({
  a,
  clanId,
  compact = false,
  personHref,
}: {
  a: UpcomingAnniversary;
  clanId: string;
  compact?: boolean;
  /** Mặc định mở người đó trên phả đồ thành viên */
  personHref?: (personId: string) => string;
}) {
  const [y, m, d] = a.solarDate.split("-");
  const soon = a.daysUntil <= 7;
  const details = [
    nthText(a.nth),
    a.generation ? `đời ${a.generation}` : null,
    a.deathYear ? `mất năm ${a.deathYear}` : null,
    a.inClan ? null : a.gender === "female" ? "dâu" : a.gender === "male" ? "rể" : null,
  ].filter(Boolean);
  return (
    <li className="flex items-center gap-4 py-3">
      <CalendarLeaf a={a} size={compact ? "sm" : "md"} />
      <div className="min-w-0 flex-1">
        <Link href={personHref ? personHref(a.personId) : `/dong-ho/${clanId}/pha-do?nguoi=${a.personId}`} className="font-serif text-lg leading-snug text-then underline-offset-4 hover:underline">
          {a.fullName}
        </Link>
        <p className="text-sm text-reu">
          <span className="sr-only">
            {WEEKDAY[a.weekday]} {Number(d)}/{Number(m)}/{y}, {lunarDayText(a.lunar)} âm lịch.{" "}
          </span>
          <span aria-hidden className="text-thep-dam">
            {lunarDayText(a.lunar)}
          </span>
          {details.length > 0 && <span> · {details.join(" · ")}</span>}
        </p>
        {!compact && a.adjustments.includes("leap-month-to-regular") && (
          <p className="text-xs text-reu">Mất vào tháng nhuận — giỗ tháng thường cùng số.</p>
        )}
        {!compact && a.adjustments.some((x) => x.startsWith("day30")) && (
          <p className="text-xs text-reu">Mất ngày 30, năm nay tháng thiếu — giỗ ngày gần nhất theo cài đặt dòng họ.</p>
        )}
      </div>
      <span
        className={`shrink-0 text-right text-sm tabular-nums ${
          a.daysUntil === 0 ? "rounded-full bg-son px-2.5 py-0.5 font-medium text-white" : soon ? "font-medium text-son" : "text-reu"
        }`}
      >
        {countdownText(a.daysUntil)}
      </span>
    </li>
  );
}
