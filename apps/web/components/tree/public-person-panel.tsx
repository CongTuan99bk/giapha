"use client";

import { useState } from "react";
import { formatAnniversary, formatFlexibleDate, GENDER_LABEL } from "@/lib/format";
import { publicMediaUrl, usePublicPerson } from "@/lib/public";
import { FormError } from "../field";
import { Lightbox } from "../lightbox";
import { OTHER_NAME, PersonLink, rankText, spouseLabel } from "./person-panel";

/** Bảng thông tin chỉ để xem trên trang công khai (người đã khuất) */
export function PublicPersonPanel({ personId, onSelect, onClose }: { personId: string; onSelect: (id: string) => void; onClose: () => void }) {
  const person = usePublicPerson(personId);
  const [viewing, setViewing] = useState(false);
  const p = person.data;
  const facts: Array<[string, string]> = [];
  if (p) {
    if (p.generation) facts.push(["Đời", String(p.generation)]);
    facts.push(["Giới tính", GENDER_LABEL[p.gender]]);
    if (p.birthDate) facts.push(["Sinh", formatFlexibleDate(p.birthDate)]);
    facts.push(["Mất", formatFlexibleDate(p.deathDate) || "Không rõ ngày"]);
    if (p.deathAnniversaryLunar) facts.push(["Ngày giỗ", formatAnniversary(p.deathAnniversaryLunar)]);
    const main = p.childOf.find((c) => c.relation !== "step");
    if (main) facts.push(["Thứ bậc", rankText(main, p.gender)]);
    for (const o of p.otherNames) facts.push([OTHER_NAME[o.type] ?? "Tên khác", o.value]);
    if (p.facts.birthPlace) facts.push(["Quê quán", p.facts.birthPlace]);
    if (p.facts.occupation) facts.push(["Nghề nghiệp", p.facts.occupation]);
    if (p.facts.burialPlace) facts.push(["Nơi an táng", p.facts.burialPlace]);
  }
  return (
    <aside
      aria-label="Thông tin người được chọn"
      className="absolute inset-x-0 bottom-0 z-10 max-h-[60dvh] overflow-y-auto rounded-t-xl border-t border-ngoc-200 bg-giay shadow-[0_-8px_24px_rgba(36,26,23,0.12)] md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[400px] md:rounded-none md:border-l md:border-t-0"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ngoc-100 bg-giay/95 px-5 py-2 backdrop-blur">
        <span className="text-sm text-reu">Thông tin</span>
        <button type="button" onClick={onClose} className="btn -mr-3 px-3 text-reu hover:text-then" aria-label="Đóng bảng thông tin">
          Đóng
        </button>
      </div>
      <div className="px-5 pb-8 pt-4">
        {person.isPending && <p className="text-reu">Đang tải…</p>}
        {person.error && <FormError message={person.error.message} />}
        {p && (
          <>
            {p.avatarMediaId && (
              <>
                <button type="button" onClick={() => setViewing(true)} className="mb-4 cursor-zoom-in rounded-md" aria-label={`Xem ảnh lớn: ${p.fullName}`}>
                  <img src={publicMediaUrl(p.avatarMediaId, "md")} alt={`Ảnh chân dung ${p.fullName}`} className="h-36 w-28 rounded-md border border-ngoc-200 object-cover" />
                </button>
                <Lightbox
                  items={[{ src: publicMediaUrl(p.avatarMediaId, "lg"), alt: `Ảnh chân dung ${p.fullName}`, caption: p.fullName }]}
                  index={viewing ? 0 : null}
                  onIndexChange={() => undefined}
                  onClose={() => setViewing(false)}
                />
              </>
            )}
            <h2 className="font-serif text-[1.75rem] leading-tight">{p.fullName}</h2>
            <dl className="mt-4 grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 text-[0.95rem]">
              {facts.map(([k, v]) => (
                <div key={`${k}-${v}`} className="contents">
                  <dt className="text-reu">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {p.biography?.text && (
              <section className="mt-6">
                <h3 className="text-sm font-medium text-reu">Tiểu sử</h3>
                <p className="mt-1 whitespace-pre-line font-serif text-[1.05rem] leading-relaxed">{p.biography.text}</p>
              </section>
            )}
            {p.childOf
              .filter((c) => c.parents.length > 0)
              .map((c) => (
                <section key={c.unionId} className="mt-6">
                  <h3 className="text-sm font-medium text-reu">{c.relation === "step" ? "Cha mẹ kế" : c.relation === "adopted" ? "Cha mẹ nuôi" : "Cha mẹ"}</h3>
                  {c.parents.map((x) => (
                    <PersonLink key={x.id} person={x} onSelect={onSelect} />
                  ))}
                </section>
              ))}
            {p.unions.map((u, i) => (
              <section key={u.id} className="mt-6">
                <h3 className="text-sm font-medium text-reu">{spouseLabel(p.gender, i, p.unions.length)}</h3>
                {u.partner ? <PersonLink person={u.partner} onSelect={onSelect} /> : <p className="mt-1 text-reu">Chưa rõ</p>}
                {u.children.length > 0 && (
                  <div className="mt-3 border-l-2 border-ngoc-200 pl-3">
                    <h4 className="text-sm font-medium text-reu">Con</h4>
                    {u.children.map((c) => (
                      <PersonLink key={c.id} person={c} onSelect={onSelect} />
                    ))}
                  </div>
                )}
              </section>
            ))}
            <p className="mt-8 border-t border-ngoc-100 pt-4 text-sm text-reu">Trang công khai chỉ hiện các cụ đã khuất. Con cháu đăng nhập để xem đầy đủ gia phả.</p>
          </>
        )}
      </div>
    </aside>
  );
}
