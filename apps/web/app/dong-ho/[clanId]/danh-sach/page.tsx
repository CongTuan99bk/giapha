"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { lifespan } from "@/lib/format";
import { usePersonSearch } from "@/lib/queries";

export default function PeopleListPage() {
  const { clanId } = useParams<{ clanId: string }>();
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q.trim());
  const list = usePersonSearch(clanId, deferred);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-serif text-3xl">Danh sách người trong phả</h1>
          {list.data && <p className="text-reu">{list.data.total} người</p>}
        </div>
        <label className="mt-6 block">
          <span className="sr-only">Tìm theo tên</span>
          <input className="o-nhap" type="search" placeholder="Tìm theo tên — gõ có dấu hay không dấu đều được" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {list.error && <p className="mt-6 text-loi">{list.error.message}</p>}
        <ul className="mt-6 divide-y divide-ngoc-200 border-y border-ngoc-200">
          {list.data?.items.map((p) => (
            <li key={p.id}>
              <Link href={`/dong-ho/${clanId}/pha-do?nguoi=${p.id}`} className="grid grid-cols-[3.5rem_1fr_auto] items-baseline gap-3 px-1 py-3 hover:bg-ngoc-100">
                <span className="text-sm text-reu">{p.generation ? `Đời ${p.generation}` : ""}</span>
                <span className={`font-serif text-lg ${p.inClan ? "" : "text-reu"}`}>{p.fullName}</span>
                <span className="text-sm tabular-nums text-reu">{lifespan(p)}</span>
              </Link>
            </li>
          ))}
        </ul>
        {list.data && list.data.items.length === 0 && <p className="mt-6 text-reu">Không có ai tên như vậy trong phả.</p>}
        {list.data && list.data.total > list.data.items.length && (
          <p className="mt-4 text-sm text-reu">Đang hiện {list.data.items.length} người đầu. Gõ tên để tìm chính xác hơn.</p>
        )}
      </div>
    </div>
  );
}
