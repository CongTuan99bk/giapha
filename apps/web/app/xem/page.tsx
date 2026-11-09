"use client";

import Link from "next/link";
import { useState } from "react";
import { AlbumGrid } from "@/components/albums";
import { AnniversaryRow } from "@/components/anniversary-list";
import { BannerCarousel } from "@/components/banner-carousel";
import { CoupletPanel, TempleAddress } from "@/components/clan-home-parts";
import { ContactList } from "@/components/contact-list";
import { Lightbox } from "@/components/lightbox";
import { PublicCounter } from "@/components/public-counter";
import { usePublicAlbums, usePublicAnniversaries, usePublicSite } from "@/lib/public";
import type { MediaItem } from "@/lib/types";

/** Trang chủ công khai: ảnh nhà thờ họ, câu đối, địa chỉ, giỗ sắp tới, ban liên lạc */
export default function PublicHome() {
  const site = usePublicSite();
  const gio = usePublicAnniversaries(365);
  const albums = usePublicAlbums().data?.albums ?? [];
  const [viewing, setViewing] = useState<number | null>(null);
  if (!site.data) return null;
  const { clan, home, stats, contacts } = site.data;
  // ảnh công khai không có bản gốc: dùng bản lớn thay chỗ
  const slides: MediaItem[] = home.banners.map((b) => ({ ...b, albumId: null, sizeBytes: 0, createdAt: "", urls: { ...b.urls, orig: b.urls.lg } }));
  const soon = (gio.data?.items ?? []).filter((a) => a.daysUntil <= 60).slice(0, 4);
  const title = (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-then/85 via-then/40 to-transparent px-5 pb-6 pt-16 md:px-8">
      <h1 className="font-serif text-[1.65rem] leading-tight text-thep-nhat md:text-[2.75rem]">{clan.name}</h1>
      {(home.motto || clan.originPlace) && <p className="mt-1 font-serif text-lg text-ngoc-100 md:text-xl">{home.motto ?? `Quê gốc: ${clan.originPlace}`}</p>}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className={home.couplet ? "grid md:grid-cols-[6rem_minmax(0,1fr)_6rem]" : ""}>
        {home.couplet && <CoupletPanel text={home.couplet.left} side="trái" />}
        <div className="relative h-[min(58vw,27rem)] min-h-[14rem]">
          {slides.length > 0 ? (
            <BannerCarousel slides={slides} onOpen={setViewing} hold={viewing !== null}>
              {title}
            </BannerCarousel>
          ) : (
            <div className="relative h-full bg-then">{title}</div>
          )}
        </div>
        {home.couplet && <CoupletPanel text={home.couplet.right} side="phải" />}
      </div>
      <Lightbox
        items={slides.map((b) => ({ src: b.urls.lg, alt: b.caption ?? `Ảnh ${clan.name}`, caption: b.caption }))}
        index={viewing}
        onIndexChange={setViewing}
        onClose={() => setViewing(null)}
      />

      <div className="mx-auto max-w-3xl px-4 py-8">
        {home.couplet && (
          <div className="mb-8 text-center font-serif text-xl leading-relaxed text-son-dam md:hidden" aria-label="Câu đối">
            <p>{home.couplet.left}</p>
            <p>{home.couplet.right}</p>
          </div>
        )}
        <p className="font-serif text-xl">
          {stats.people > 0
            ? `Phả đồ ghi ${stats.people.toLocaleString("vi-VN")} vị tiên tổ đã khuất qua ${stats.generations} đời.`
            : "Ban quản lý đang nhập phả đồ."}
        </p>
        <p className="mt-1 text-sm text-reu">Thông tin người còn sống chỉ dành cho con cháu trong họ — hãy đăng nhập để xem đầy đủ.</p>
        {home.templeAddress && <TempleAddress address={home.templeAddress} />}

        {soon.length > 0 && (
          <section aria-labelledby="gio-sap-toi" className="mt-8 rounded-md border border-[#d6c9ae] bg-do/60 px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="gio-sap-toi" className="font-serif text-xl text-son-dam">
                Giỗ sắp tới
              </h2>
              <Link href="/xem/lich-gio" className="text-sm font-medium text-son underline-offset-4 hover:underline">
                Xem lịch giỗ
              </Link>
            </div>
            <ul className="mt-1 divide-y divide-[#e3d8c2]">
              {soon.map((a) => (
                <AnniversaryRow key={`${a.personId}-${a.lunar.year}`} a={a} clanId="" compact personHref={(id) => `/xem/pha-do?nguoi=${id}`} />
              ))}
            </ul>
          </section>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/xem/pha-do" className="btn-chinh">
            Xem phả đồ
          </Link>
          <Link href="/xem/lich-gio" className="btn-phu">
            Lịch giỗ
          </Link>
        </div>

        {albums.length > 0 && (
          <section aria-labelledby="tieu-de-anh" className="mt-12 border-t border-ngoc-200 pt-8">
            <div className="mb-5 flex items-baseline justify-between gap-4">
              <h2 id="tieu-de-anh" className="font-serif text-2xl">
                Thư viện ảnh
              </h2>
              {albums.length > 4 && (
                <Link href="/xem/anh" className="text-sm font-medium text-son underline-offset-4 hover:underline">
                  Xem cả {albums.length} album
                </Link>
              )}
            </div>
            <AlbumGrid albums={albums.slice(0, 4)} hrefOf={(a) => `/xem/anh?album=${a.id}`} />
          </section>
        )}

        <section id="lien-he" aria-labelledby="tieu-de-lien-he" className="mt-12 scroll-mt-4 border-t border-ngoc-200 pt-8">
          <h2 id="tieu-de-lien-he" className="font-serif text-2xl">
            Ban liên lạc
          </h2>
          <p className="mb-5 mt-1 text-reu">Con cháu xa quê muốn bổ sung gia phả, hỏi ngày giỗ, đường về nhà thờ họ — xin liên hệ:</p>
          <ContactList contacts={contacts} />
          <Link href="/xem/lien-he#gui-loi-nhan" className="mt-5 inline-block font-medium text-son underline-offset-4 hover:underline">
            Gửi lời nhắn cho ban quản lý
          </Link>
        </section>
        <PublicCounter />
      </div>
    </div>
  );
}
