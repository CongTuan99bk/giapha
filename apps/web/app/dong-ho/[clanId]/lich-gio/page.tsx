"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AnniversaryRow } from "@/components/anniversary-list";
import { FormError } from "@/components/field";
import { useAnniversaries, useClan } from "@/lib/queries";
import { ROLE_RANK } from "@/lib/roles";
import type { UpcomingAnniversary } from "@/lib/types";

/** Lịch giỗ: các ngày giỗ trong 12 tháng tới, chia theo tháng dương lịch, tải được về lịch điện thoại. */
export default function AnniversaryPage() {
  const { clanId } = useParams<{ clanId: string }>();
  const clan = useClan(clanId);
  const list = useAnniversaries(clanId, 365);

  const months = new Map<string, UpcomingAnniversary[]>();
  for (const a of list.data?.items ?? []) {
    const key = a.solarDate.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), a]);
  }
  const canEdit = clan.data ? ROLE_RANK[clan.data.role] >= ROLE_RANK.editor : false;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-8">
        <h1 className="font-serif text-3xl">Lịch giỗ</h1>
        <p className="mt-1 max-w-prose text-reu">
          Ngày giỗ tính theo âm lịch từ ngày mất đã ghi trong phả, đổi sang dương lịch cho từng năm. Mười hai tháng tới:
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <a href={`/api/v1/clans/${clanId}/anniversaries.ics?years=2`} download="lich-gio.ics" className="btn-phu">
            Thêm vào lịch điện thoại
          </a>
          <span className="text-sm text-reu">File lịch hai năm tới, mở bằng điện thoại là thêm được; nhắc trước 3 ngày.</span>
        </div>

        {list.error && (
          <div className="mt-6">
            <FormError message={list.error.message} />
          </div>
        )}
        {list.isPending && <p className="mt-8 text-reu">Đang tính ngày giỗ…</p>}

        {list.data && list.data.items.length === 0 && (
          <p className="mt-10 font-serif text-xl text-reu">
            Chưa có ngày giỗ nào. Khi ghi ngày mất (âm hoặc dương lịch, đủ ngày và tháng) cho người đã khuất, ngày giỗ tự hiện ở đây.
          </p>
        )}

        {[...months.entries()].map(([key, items]) => {
          const [y, m] = key.split("-").map(Number);
          return (
            <section key={key} className="mt-10" aria-labelledby={`thang-${key}`}>
              <h2 id={`thang-${key}`} className="border-b border-thep/40 pb-1 font-serif text-xl text-son-dam">
                Tháng {m} năm {y}
              </h2>
              <ul className="divide-y divide-ngoc-200">
                {items.map((a) => (
                  <AnniversaryRow key={`${a.personId}-${a.lunar.year}`} a={a} clanId={clanId} />
                ))}
              </ul>
            </section>
          );
        })}

        {list.data && list.data.missingDeathDay > 0 && (
          <p className="mt-10 rounded-md border border-ngoc-300 bg-ngoc-100 px-4 py-3 text-sm">
            {list.data.missingDeathDay} người trong họ đã mất nhưng chưa ghi đủ ngày, tháng mất nên chưa có trong lịch.
            {canEdit && (
              <>
                {" "}
                Bổ sung ở{" "}
                <Link href={`/dong-ho/${clanId}/danh-sach`} className="font-medium text-son underline-offset-4 hover:underline">
                  Danh sách
                </Link>{" "}
                (bấm vào người, chọn Sửa thông tin).
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
