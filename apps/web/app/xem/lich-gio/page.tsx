"use client";

import { AnniversaryRow } from "@/components/anniversary-list";
import { FormError } from "@/components/field";
import { usePublicAnniversaries } from "@/lib/public";
import type { UpcomingAnniversary } from "@/lib/types";

/** Lịch giỗ công khai: các cụ đã khuất trong 12 tháng tới */
export default function PublicAnniversaryPage() {
  const list = usePublicAnniversaries(365);
  const months = new Map<string, UpcomingAnniversary[]>();
  for (const a of list.data?.items ?? []) {
    const key = a.solarDate.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), a]);
  }
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-8">
        <h1 className="font-serif text-3xl">Lịch giỗ</h1>
        <p className="mt-1 max-w-prose text-reu">Ngày giỗ các cụ trong mười hai tháng tới, tính theo âm lịch và đổi sang dương lịch.</p>
        {list.error && (
          <div className="mt-6">
            <FormError message={list.error.message} />
          </div>
        )}
        {list.data && list.data.items.length === 0 && <p className="mt-10 font-serif text-xl text-reu">Chưa có ngày giỗ nào được công khai.</p>}
        {[...months.entries()].map(([key, items]) => {
          const [y, m] = key.split("-").map(Number);
          return (
            <section key={key} className="mt-10" aria-labelledby={`thang-${key}`}>
              <h2 id={`thang-${key}`} className="border-b border-thep/40 pb-1 font-serif text-xl text-son-dam">
                Tháng {m} năm {y}
              </h2>
              <ul className="divide-y divide-ngoc-200">
                {items.map((a) => (
                  <AnniversaryRow key={`${a.personId}-${a.lunar.year}`} a={a} clanId="" personHref={(id) => `/xem/pha-do?nguoi=${id}`} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
