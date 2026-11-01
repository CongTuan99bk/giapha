"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { FormError } from "@/components/field";
import { PersonPicker } from "@/components/person-picker";
import { useKinship } from "@/lib/queries";
import type { PersonListItem } from "@/lib/types";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function KinshipPage() {
  const { clanId } = useParams<{ clanId: string }>();
  const [a, setA] = useState<PersonListItem | null>(null);
  const [b, setB] = useState<PersonListItem | null>(null);
  const result = useKinship(clanId, a?.id ?? null, b?.id ?? null);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="font-serif text-3xl">Tra cách xưng hô</h1>
        <p className="mt-2 text-reu">Chọn hai người trong họ để biết họ gọi nhau thế nào.</p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <PersonPicker clanId={clanId} label="Người thứ nhất" value={a} onChange={setA} />
          <PersonPicker clanId={clanId} label="Người thứ hai" value={b} onChange={setB} />
        </div>

        {a && b && a.id === b.id && <p className="mt-8 text-reu">Hãy chọn hai người khác nhau.</p>}
        {result.error && <div className="mt-8"><FormError message={result.error.message} /></div>}
        {a && b && result.data && (
          <section aria-live="polite" className="mt-10 border-t border-ngoc-200 pt-8">
            {result.data.related ? (
              <div className="grid gap-8 sm:grid-cols-2">
                <Saying who={a.fullName} calls={result.data.aCallsB!} whom={b.fullName} />
                <Saying who={b.fullName} calls={result.data.bCallsA!} whom={a.fullName} />
              </div>
            ) : (
              <p className="font-serif text-xl text-reu">{result.data.message}</p>
            )}
            <p className="mt-8 text-sm text-reu">
              Cách gọi theo bảng xưng hô miền Trung đang dùng cho dòng họ. Mỗi vùng, mỗi nhà có thể gọi khác — ban quản lý sẽ chỉnh được bảng này.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function Saying({ who, calls, whom }: { who: string; calls: string; whom: string }) {
  return (
    <div>
      <p className="text-reu">{who} gọi {whom} là</p>
      <p className="mt-1 font-serif text-[2.5rem] leading-tight text-son">{capitalize(calls)}</p>
    </div>
  );
}
