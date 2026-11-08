"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormError } from "@/components/field";
import { useClan, useDailyStats, useLiveStats } from "@/lib/queries";
import { ROLE_RANK } from "@/lib/roles";
import type { DailyStats } from "@/lib/types";

const RANGES = [
  { days: 7, label: "7 ngày" },
  { days: 30, label: "30 ngày" },
  { days: 90, label: "3 tháng" },
] as const;

const DEVICE_LABEL: Record<string, string> = { mobile: "Điện thoại", tablet: "Máy tính bảng", desktop: "Máy tính" };

/** Ngày "YYYY-MM-DD" theo giờ Việt Nam, lùi `back` ngày */
function vnDate(back = 0): string {
  return new Date(Date.now() + 7 * 3600_000 - back * 86_400_000).toISOString().slice(0, 10);
}

/** Tên dễ hiểu cho đường dẫn trang ("/xem/pha-do" → "Phả đồ công khai") */
function pageLabel(path: string): string {
  const pub: Record<string, string> = {
    "/xem": "Trang chủ công khai",
    "/xem/pha-do": "Phả đồ công khai",
    "/xem/lich-gio": "Lịch giỗ công khai",
    "/xem/lien-he": "Liên hệ (công khai)",
    "/": "Trang đầu",
    "/dang-nhap": "Đăng nhập",
    "/dang-ky": "Đăng ký",
    "/tro-giup": "Trợ giúp",
  };
  if (pub[path]) return pub[path];
  const m = /^\/dong-ho\/:id(\/.*)?$/.exec(path);
  if (m) {
    const sub: Record<string, string> = {
      "": "Trang chủ thành viên",
      "/pha-do": "Phả đồ (thành viên)",
      "/lich-gio": "Lịch giỗ (thành viên)",
      "/danh-sach": "Danh sách người",
      "/xung-ho": "Xưng hô",
      "/cai-dat": "Cài đặt",
      "/thong-ke": "Thống kê",
    };
    return sub[m[1] ?? ""] ?? path;
  }
  return path;
}

/** Thống kê truy cập cho ban quản lý: đang xem, lượt xem theo ngày, trang / nguồn / thiết bị / người được xem nhiều */
export default function StatsPage() {
  const { clanId } = useParams<{ clanId: string }>();
  const clan = useClan(clanId);
  const [range, setRange] = useState<number>(30);
  const to = vnDate();
  const from = vnDate(range - 1);
  const daily = useDailyStats(clanId, from, to);
  const isAdmin = clan.data ? ROLE_RANK[clan.data.role] >= ROLE_RANK.admin : true;

  if (!isAdmin) {
    return <p className="mx-auto max-w-3xl px-4 pt-8 text-reu">Chỉ ban quản lý xem được thống kê.</p>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 pb-20 pt-8">
        <h1 className="font-serif text-3xl">Thống kê truy cập</h1>
        <p className="mt-1 max-w-prose text-reu">
          Đếm lượt mở trang của cả khách và con cháu đã đăng nhập. Không lưu địa chỉ IP hay tên người xem; số liệu ghi theo giờ Việt Nam.
        </p>

        <LiveCard clanId={clanId} />

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl">Lượt xem theo ngày</h2>
          <div role="group" aria-label="Khoảng thời gian" className="flex gap-1 rounded-md border border-ngoc-200 bg-giay p-1">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                aria-pressed={range === r.days}
                onClick={() => setRange(r.days)}
                className={`rounded px-3 py-1 text-sm ${range === r.days ? "bg-then font-medium text-ngoc-50" : "text-reu hover:bg-ngoc-100"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {daily.error && (
          <div className="mt-4">
            <FormError message={daily.error.message} />
          </div>
        )}
        {daily.isPending && <p className="mt-6 text-reu">Đang tải số liệu…</p>}
        {daily.data && <DailySection data={daily.data} from={from} days={range} clanId={clanId} />}
      </div>
    </div>
  );
}

function LiveCard({ clanId }: { clanId: string }) {
  const live = useLiveStats(clanId);
  const d = live.data;
  return (
    <section aria-labelledby="dang-xem" className="mt-6 rounded-md border border-[#d6c9ae] bg-do/60 px-5 py-4">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <h2 id="dang-xem" className="text-sm text-reu">
            Đang xem ngay lúc này
          </h2>
          <p className="font-serif text-5xl leading-none text-then tabular-nums" aria-live="polite">
            {d ? d.online.toLocaleString("vi-VN") : "…"}
          </p>
        </div>
        {d && (
          <p className="pb-1 text-reu">
            {d.guests.toLocaleString("vi-VN")} khách, {d.members.toLocaleString("vi-VN")} con cháu đã đăng nhập
          </p>
        )}
      </div>
      {d && d.pages.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {d.pages.map((p) => (
            <li key={p.path}>
              {pageLabel(p.path)}: <span className="tabular-nums font-medium">{p.online}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-reu">Tự cập nhật mỗi 30 giây. Một người được tính là đang xem nếu mở trang trong 90 giây qua.</p>
    </section>
  );
}

function DailySection({ data, from, days, clanId }: { data: DailyStats; from: string; days: number; clanId: string }) {
  // ngày không có ai xem vẫn có cột 0, để thấy đúng nhịp
  const series = useMemo(() => {
    const byDate = new Map(data.days.map((d) => [d.date, d]));
    const start = Date.parse(`${from}T00:00:00Z`);
    return Array.from({ length: days }, (_, i) => {
      const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
      return byDate.get(date) ?? { date, pageViews: 0, uniqueVisitors: 0, memberViews: 0 };
    });
  }, [data.days, from, days]);
  const views = series.reduce((n, d) => n + d.pageViews, 0);
  const visitorDays = series.reduce((n, d) => n + d.uniqueVisitors, 0);
  const busiest = series.reduce((a, b) => (b.pageViews > a.pageViews ? b : a), series[0]!);

  return (
    <>
      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure label="Lượt xem" value={views} />
        <Figure label="Người xem trung bình mỗi ngày" value={Math.round(visitorDays / days)} />
        <Figure label="Ngày đông nhất" value={busiest.pageViews} note={busiest.pageViews ? shortDate(busiest.date) : undefined} />
        <Figure label="Tổng từ trước đến nay" value={data.allTimeViews} />
      </dl>

      <ViewsChart series={series} />

      <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
        <TopList title="Trang được xem nhiều" rows={data.pages.map((p) => ({ key: p.key, label: pageLabel(p.key), views: p.views }))} />
        <TopList
          title="Người được xem nhiều"
          empty="Chưa có ai được mở hồ sơ trên phả đồ."
          rows={data.persons.map((p) => ({
            key: p.key,
            label: (
              <Link href={`/dong-ho/${clanId}/pha-do?nguoi=${p.key}`} className="underline-offset-4 hover:underline">
                {p.fullName}
              </Link>
            ),
            views: p.views,
          }))}
        />
        <TopList
          title="Đến từ đâu"
          empty="Chưa có ai mở link từ trang khác (Zalo, Facebook…)."
          rows={data.referrers.map((r) => ({ key: r.key, label: r.key, views: r.views }))}
        />
        <TopList title="Thiết bị" rows={data.devices.map((r) => ({ key: r.key, label: DEVICE_LABEL[r.key] ?? r.key, views: r.views }))} />
      </div>
    </>
  );
}

function Figure({ label, value, note }: { label: string; value: number; note?: string | undefined }) {
  return (
    <div className="border-l-2 border-thep pl-3">
      <dt className="text-sm text-reu">{label}</dt>
      <dd className="font-serif text-3xl tabular-nums text-then">
        {value.toLocaleString("vi-VN")}
        {note && <span className="ml-2 font-sans text-sm text-reu">{note}</span>}
      </dd>
    </div>
  );
}

const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${m}`;
};

/**
 * Cột lượt xem mỗi ngày: một chuỗi số liệu nên một màu (vàng thếp), cột mảnh bo đầu, đường lưới nhạt.
 * Rê chuột / chạm vào cột để xem số; có bảng số liệu bên dưới cho người dùng trình đọc màn hình.
 */
function ViewsChart({ series }: { series: DailyStats["days"] }) {
  const [hover, setHover] = useState<number | null>(null);
  // vẽ theo đúng bề rộng khung (không co giãn ảnh) để chữ trên trục luôn đủ to, kể cả trên điện thoại
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = Math.max(4, ...series.map((d) => d.pageViews));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const H = W < 500 ? 180 : 220;
  const pad = { l: 36, r: 8, t: 12, b: 26 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const slot = plotW / series.length;
  const barW = Math.max(2, Math.min(28, slot - 2)); // khe 2px giữa các cột
  const y = (v: number) => pad.t + plotH - (v / top) * plotH;
  // mỗi nhãn ngày cần khoảng 44px
  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(plotW / 44))));
  const active = hover === null ? null : series[hover];

  return (
    <figure className="mt-6">
      <figcaption className="sr-only">Biểu đồ cột lượt xem mỗi ngày</figcaption>
      <div ref={box} className="relative">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label="Lượt xem mỗi ngày" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#d3ddd0" strokeWidth={t === 0 ? 1 : 0.6} />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="fill-reu text-[11px] tabular-nums">
                {t.toLocaleString("vi-VN")}
              </text>
            </g>
          ))}
          {series.map((d, i) => {
            const x = pad.l + i * slot + (slot - barW) / 2;
            const h = Math.max(0, y(0) - y(d.pageViews));
            const r = Math.min(4, barW / 2, h);
            return (
              <g key={d.date}>
                {h > 0 && (
                  <path
                    d={`M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + barW - r} Q${x + barW},${y(0) - h} ${x + barW},${y(0) - h + r} V${y(0)} Z`}
                    fill={hover === i ? "#7a571b" : "#a8792a"}
                  />
                )}
                {/* vùng bắt chuột cao hết biểu đồ, rộng hết khe — dễ trúng hơn cột mảnh */}
                <rect
                  x={pad.l + i * slot}
                  y={pad.t}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onClick={() => setHover(i)}
                />
                {i % labelEvery === 0 && (
                  <text x={pad.l + i * slot + slot / 2} y={H - 8} textAnchor="middle" className="fill-reu text-[11px]">
                    {shortDate(d.date)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {active && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 w-36 -translate-x-1/2 rounded border border-ngoc-200 bg-the px-3 py-2 text-sm shadow-md"
            // giữ ô gợi ý trong khung, không tràn mép màn hình
            style={{ left: Math.min(W - 76, Math.max(76, pad.l + hover * slot + slot / 2)) }}
          >
            <p className="font-medium">{shortDate(active.date)}</p>
            <p className="tabular-nums">{active.pageViews.toLocaleString("vi-VN")} lượt xem</p>
            <p className="tabular-nums text-reu">{active.uniqueVisitors.toLocaleString("vi-VN")} người xem</p>
          </div>
        )}
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-son">Xem dạng bảng</summary>
        <table className="mt-2 w-full max-w-md text-left">
          <thead className="text-reu">
            <tr>
              <th className="py-1 font-normal">Ngày</th>
              <th className="py-1 text-right font-normal">Lượt xem</th>
              <th className="py-1 text-right font-normal">Người xem</th>
              <th className="py-1 text-right font-normal">Lượt của con cháu</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {series.map((d) => (
              <tr key={d.date} className="border-t border-ngoc-200">
                <td className="py-1">{shortDate(d.date)}</td>
                <td className="py-1 text-right">{d.pageViews.toLocaleString("vi-VN")}</td>
                <td className="py-1 text-right">{d.uniqueVisitors.toLocaleString("vi-VN")}</td>
                <td className="py-1 text-right">{d.memberViews.toLocaleString("vi-VN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Bước chia trục tròn số (1, 2, 5 × 10ⁿ) để có khoảng 4 vạch */
function niceStep(max: number): number {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

function TopList({ title, rows, empty = "Chưa có số liệu." }: { title: string; rows: Array<{ key: string; label: React.ReactNode; views: number }>; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  return (
    <section>
      <h3 className="border-b border-thep/40 pb-1 font-serif text-xl text-son-dam">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-reu">{empty}</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-3 text-[0.95rem]">
                <span className="min-w-0 truncate">{r.label}</span>
                <span className="tabular-nums text-reu">{r.views.toLocaleString("vi-VN")}</span>
              </div>
              <div className="mt-0.5 h-1 rounded-full bg-ngoc-100" aria-hidden>
                <div className="h-1 rounded-full bg-thep" style={{ width: `${(r.views / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
