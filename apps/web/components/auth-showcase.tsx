"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { usePublicSite } from "@/lib/public";
import type { AnniversaryList } from "@/lib/types";
import { countdownText, lunarDayText } from "./anniversary-list";

/** Câu đối mặc định khi dòng họ chưa ghi câu đối riêng */
const DEFAULT_COUPLET = { left: "Cây có cội", right: "Nước có nguồn" };
const TAGLINE = "Ghi lại các đời trong họ, ngày giỗ của từng cụ, và cách con cháu gọi nhau — để người sau biết mình từ đâu.";

/**
 * Bên trái trang đăng nhập / đăng ký, dựng như gian thờ họ: bức hoành phi mang tên dòng họ,
 * ảnh nhà thờ họ ở giữa, hai bên là câu đối viết dọc (mỗi chữ một dòng như trên cột nhà thờ),
 * dưới cùng là số đời và ngày giỗ sắp tới (đường vào trang công khai đã có ở dưới form).
 * Chưa có dòng họ (hoặc chạy nhiều dòng họ): chỉ tên sản phẩm và câu đối mặc định.
 */
export function AuthShowcase() {
  const site = usePublicSite();
  const s = site.data;
  const next = useQuery({
    queryKey: ["public", "anniversaries", 60],
    queryFn: () => api<AnniversaryList>("GET", "/public/anniversaries?days=60"),
    enabled: Boolean(s),
    retry: false,
    staleTime: 10 * 60_000,
  }).data?.items[0];
  const banner = s?.home.banners[0];
  const couplet = s?.home.couplet ?? DEFAULT_COUPLET;

  return (
    <aside className="relative overflow-hidden bg-then px-6 py-7 text-ngoc-50 md:flex md:flex-col md:px-10 md:py-10 lg:px-14">
      {/* vân sơn mài mờ phía sau, chỉ để nền có chiều sâu */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(120% 70% at 50% 38%, rgb(142 43 33 / 0.28), transparent 62%), radial-gradient(60% 40% at 50% 100%, rgb(168 121 42 / 0.14), transparent 70%)",
        }}
      />

      <div className="relative">
        {s ? (
          <>
            <p className="text-sm tracking-wide text-thep">Gia Phả Cội Nguồn</p>
            {/* Hoành phi: tên dòng họ trong khung vàng đôi */}
            <div className="mt-2 border border-thep/70 p-1 md:mt-4">
              <div className="border border-thep/40 bg-son-dam/40 px-4 py-3 text-center md:py-4">
                <p className="font-serif text-2xl leading-tight text-thep-nhat md:text-[2.4rem]">{s.clan.name}</p>
                {s.clan.originPlace && <p className="mt-1 hidden text-sm text-ngoc-200 md:block">Gốc tích: {s.clan.originPlace}</p>}
              </div>
            </div>
          </>
        ) : (
          <p className="font-serif text-2xl text-thep-nhat md:text-[2.75rem] md:leading-[1.1]">Gia Phả Cội Nguồn</p>
        )}
      </div>

      {/* Ảnh nhà thờ họ giữa hai câu đối — chỉ trên màn hình rộng, điện thoại để form lên đầu */}
      <div className="relative hidden flex-1 items-center justify-center gap-4 py-8 md:flex lg:gap-6">
        <CoupletStrip text={couplet.left} label="Câu đối bên trái" />
        <figure className="min-w-0 max-w-md flex-1">
          {banner ? (
            <>
              <div className="border border-thep/70 p-1 shadow-[0_10px_30px_rgb(0_0_0/0.35)]">
                <img src={banner.urls.lg} alt={banner.caption ?? `Ảnh ${s?.clan.name ?? "dòng họ"}`} className="aspect-[4/3] w-full object-cover" />
              </div>
              {banner.caption && <figcaption className="mt-2 text-center text-sm text-ngoc-200">{banner.caption}</figcaption>}
            </>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center border border-thep/40 px-6 text-center">
              <p className="font-serif text-xl leading-relaxed text-ngoc-200 lg:text-2xl">{s?.home.motto ?? "Uống nước nhớ nguồn"}</p>
            </div>
          )}
        </figure>
        <CoupletStrip text={couplet.right} label="Câu đối bên phải" />
      </div>

      <div className="relative space-y-2">
        {s ? (
          <>
            {banner && s.home.motto && <p className="hidden text-center font-serif text-lg text-thep-nhat md:block">{s.home.motto}</p>}
            <dl className="hidden gap-x-8 gap-y-1 border-t border-thep/30 pt-4 text-sm text-ngoc-200 md:flex md:flex-wrap">
              {s.stats.people > 0 && (
                <div>
                  <dt className="inline">Trong phả công khai: </dt>
                  <dd className="inline text-ngoc-50">
                    {s.stats.generations} đời, {s.stats.people.toLocaleString("vi-VN")} cụ đã khuất
                  </dd>
                </div>
              )}
              {next && (
                <div>
                  <dt className="inline">Giỗ sắp tới: </dt>
                  <dd className="inline text-ngoc-50">
                    {next.fullName}, {lunarDayText(next.lunar)} âm lịch ({countdownText(next.daysUntil).toLowerCase()})
                  </dd>
                </div>
              )}
            </dl>
          </>
        ) : (
          <p className="max-w-sm font-serif text-lg leading-relaxed text-ngoc-200 md:text-xl">{TAGLINE}</p>
        )}
      </div>
    </aside>
  );
}

/** Câu đối dọc: dải sơn son viền vàng, mỗi chữ một dòng */
function CoupletStrip({ text, label }: { text: string; label: string }) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const small = words.length > 7;
  return (
    <p
      aria-label={`${label}: ${text}`}
      className="flex shrink-0 flex-col items-center border border-thep/70 bg-son-dam px-2 py-4 shadow-[inset_0_0_0_3px_rgb(36_26_23/0.6)] lg:px-3"
    >
      {words.map((w, i) => (
        <span key={i} aria-hidden className={`font-serif leading-snug text-thep-nhat ${small ? "text-base lg:text-lg" : "text-lg lg:text-xl"}`}>
          {w}
        </span>
      ))}
    </p>
  );
}
