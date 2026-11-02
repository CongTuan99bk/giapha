"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BannerCarousel } from "@/components/banner-carousel";
import { Lightbox } from "@/components/lightbox";
import { FormError } from "@/components/field";
import { useClan, useHome } from "@/lib/queries";
import { ROLE_RANK } from "@/lib/roles";

/** Trang chủ dòng họ: banner ảnh tự trượt, câu đối hai bên, lối vào phả đồ. */
export default function ClanHomePage() {
  const { clanId } = useParams<{ clanId: string }>();
  const clan = useClan(clanId);
  const home = useHome(clanId);
  const [viewing, setViewing] = useState<number | null>(null);

  if (clan.error || home.error) return <div className="p-6"><FormError message={(clan.error ?? home.error)!.message} /></div>;
  if (!clan.data || !home.data) return <p className="p-6 text-reu">Đang tải…</p>;

  const c = clan.data;
  const h = home.data;
  const isAdmin = ROLE_RANK[c.role] >= ROLE_RANK.admin;
  const base = `/dong-ho/${clanId}`;
  const title = (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-then/85 via-then/40 to-transparent px-5 pb-6 pt-16 md:px-8">
      <h1 className="font-serif text-[1.65rem] leading-tight text-thep-nhat md:text-[2.75rem]">{c.name}</h1>
      {(h.motto || c.originPlace) && (
        <p className="mt-1 font-serif text-lg text-ngoc-100 md:text-xl">{h.motto ?? `Quê gốc: ${c.originPlace}`}</p>
      )}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className={h.couplet ? "grid md:grid-cols-[6rem_minmax(0,1fr)_6rem]" : ""}>
        {h.couplet && <CoupletPanel text={h.couplet.left} side="trái" />}
        <div className="relative h-[min(58vw,27rem)] min-h-[14rem]">
          {h.banners.length > 0 ? (
            <BannerCarousel slides={h.banners} onOpen={setViewing} hold={viewing !== null}>
              {title}
            </BannerCarousel>
          ) : (
            <div className="relative h-full bg-then">
              {isAdmin && (
                <Link
                  href={`${base}/cai-dat#trang-chu`}
                  className="absolute right-4 top-4 rounded-md border border-thep/60 px-3 py-2 text-sm text-thep-nhat hover:bg-thep/20"
                >
                  Thêm ảnh nhà thờ họ, ảnh đại gia đình
                </Link>
              )}
              {title}
            </div>
          )}
        </div>
        {h.couplet && <CoupletPanel text={h.couplet.right} side="phải" />}
      </div>

      <Lightbox
        items={h.banners.map((b) => ({ src: b.urls.lg, zoomSrc: b.urls.orig, downloadUrl: b.urls.orig, alt: b.caption ?? `Ảnh ${c.name}`, caption: b.caption }))}
        index={viewing}
        onIndexChange={setViewing}
        onClose={() => setViewing(null)}
      />

      <div className="mx-auto max-w-3xl px-4 py-8">
        {h.couplet && (
          <div className="mb-8 text-center font-serif text-xl leading-relaxed text-son-dam md:hidden" aria-label="Câu đối">
            <p>{h.couplet.left}</p>
            <p>{h.couplet.right}</p>
          </div>
        )}
        <p className="font-serif text-xl">
          {h.stats.people === 0
            ? "Phả đồ chưa có ai."
            : `Phả đồ đang ghi ${h.stats.people.toLocaleString("vi-VN")} người qua ${h.stats.generations} đời.`}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`${base}/pha-do`} className="btn-chinh">
            {h.stats.people === 0 ? "Bắt đầu nhập phả" : "Xem phả đồ"}
          </Link>
          <Link href={`${base}/xung-ho`} className="btn-phu">
            Tra cách xưng hô
          </Link>
          <Link href={`${base}/danh-sach`} className="btn-phu">
            Tìm người trong phả
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Một vế câu đối dựng đứng: mỗi chữ một dòng, chữ vàng trên nền son. */
function CoupletPanel({ text, side }: { text: string; side: "trái" | "phải" }) {
  const words = text.split(/\s+/).filter(Boolean);
  const size = words.length <= 7 ? "text-[1.35rem]" : words.length <= 9 ? "text-[1.15rem]" : "text-base";
  return (
    <div className="hidden bg-son-dam p-1.5 md:block" aria-label={`Câu đối vế ${side}: ${text}`} role="note">
      <div className={`flex h-full flex-col items-center justify-evenly border border-thep/70 py-3 font-serif capitalize leading-none text-thep-nhat ${size}`} aria-hidden>
        {words.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
    </div>
  );
}
