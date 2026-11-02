"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { formatAnniversary, formatFlexibleDate, GENDER_LABEL } from "@/lib/format";
import { useAddPerson, useDeletePerson, useLinkMe, usePerson, useSetAvatar, useUpdatePerson, type RelativeKind } from "@/lib/queries";
import { mediaUrl, uploadImage } from "@/lib/upload";
import type { Clan, Gender, PersonBrief, PersonDetail } from "@/lib/types";
import { FormError } from "../field";
import { PersonForm } from "../person-form";

type Mode = { kind: "view" } | { kind: "edit" } | { kind: "add"; relative: RelativeKind; unionId?: string } | { kind: "delete"; needsConfirm: boolean };

interface Props {
  clan: Clan;
  personId: string;
  canEdit: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}

const ADD_TITLE: Record<RelativeKind, string> = { child: "Thêm con", spouse: "Thêm vợ/chồng", parent: "Thêm cha hoặc mẹ" };

/** Bảng thông tin người đang chọn: xem, sửa, thêm người thân, xoá. */
export function PersonPanel({ clan, personId, canEdit, onSelect, onClose }: Props) {
  const person = usePerson(clan.id, personId);
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [lastId, setLastId] = useState(personId);
  if (lastId !== personId) {
    setLastId(personId);
    setMode({ kind: "view" });
  }
  const scroller = useRef<HTMLElement>(null);
  // Đổi người hoặc đổi chế độ (xem → thêm/sửa) thì cuộn lên đầu bảng
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [mode.kind, personId]);

  return (
    <aside
      ref={scroller}
      aria-label="Thông tin người được chọn"
      className="absolute inset-x-0 bottom-0 z-10 max-h-[60dvh] overflow-y-auto rounded-t-xl border-t border-ngoc-200 bg-giay shadow-[0_-8px_24px_rgba(36,26,23,0.12)] md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[400px] md:rounded-none md:border-l md:border-t-0"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ngoc-100 bg-giay/95 px-5 py-2 backdrop-blur">
        <span className="text-sm text-reu">
          {mode.kind === "view" ? "Thông tin" : mode.kind === "edit" ? "Sửa thông tin" : mode.kind === "add" ? ADD_TITLE[mode.relative] : "Xoá khỏi phả đồ"}
        </span>
        <button type="button" onClick={onClose} className="btn -mr-3 px-3 text-reu hover:text-then" aria-label="Đóng bảng thông tin">
          Đóng
        </button>
      </div>
      <div className="px-5 pb-8 pt-4">
        {person.isPending && <p className="text-reu">Đang tải…</p>}
        {person.error && <FormError message={person.error.message} />}
        {person.data && mode.kind === "view" && (
          <PersonView p={person.data} clan={clan} canEdit={canEdit} onSelect={onSelect} setMode={setMode} />
        )}
        {person.data && mode.kind === "edit" && <EditPerson clanId={clan.id} p={person.data} done={() => setMode({ kind: "view" })} />}
        {person.data && mode.kind === "add" && (
          <AddRelative clanId={clan.id} p={person.data} relative={mode.relative} unionId={mode.unionId} onSelect={onSelect} cancel={() => setMode({ kind: "view" })} />
        )}
        {person.data && mode.kind === "delete" && (
          <DeletePerson clanId={clan.id} p={person.data} needsConfirm={mode.needsConfirm} setMode={setMode} onDeleted={onClose} />
        )}
      </div>
    </aside>
  );
}

function PersonView({
  p,
  clan,
  canEdit,
  onSelect,
  setMode,
}: {
  p: PersonDetail;
  clan: Clan;
  canEdit: boolean;
  onSelect: (id: string) => void;
  setMode: (m: Mode) => void;
}) {
  const isRoot = clan.rootPersonId === p.id;
  const facts: Array<[string, string]> = [];
  if (p.generation) facts.push(["Đời", `${p.generation}${isRoot ? " — thuỷ tổ" : ""}`]);
  facts.push(["Giới tính", GENDER_LABEL[p.gender]]);
  if (p.birthDate) facts.push(["Sinh", formatFlexibleDate(p.birthDate)]);
  if (!p.isLiving) facts.push(["Mất", formatFlexibleDate(p.deathDate) || "Không rõ ngày"]);
  if (p.deathAnniversaryLunar) facts.push(["Ngày giỗ", formatAnniversary(p.deathAnniversaryLunar)]);
  if (!p.inClan) facts.push(["Quan hệ với họ", p.gender === "female" ? "Con dâu" : p.gender === "male" ? "Con rể" : "Dâu/rể"]);
  for (const o of p.otherNames) facts.push([OTHER_NAME[o.type] ?? "Tên khác", o.value]);

  const hasParents = p.parents.length > 0;
  return (
    <div>
      <Portrait clanId={clan.id} p={p} canEdit={canEdit} />
      <h2 className="font-serif text-[1.75rem] leading-tight">{p.fullName}</h2>
      <ThisIsMe clan={clan} personId={p.id} />
      <dl className="mt-4 grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 text-[0.95rem]">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-reu">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <Relatives title="Cha mẹ" people={p.parents} onSelect={onSelect} empty={canEdit ? undefined : "Chưa có thông tin"} />
      {p.unions.map((u) => (
        <section key={u.id} className="mt-6">
          <h3 className="text-sm font-medium text-reu">{p.gender === "female" ? "Chồng" : p.gender === "male" ? "Vợ" : "Vợ/chồng"}</h3>
          {u.partner ? <PersonLink person={u.partner} onSelect={onSelect} /> : <p className="mt-1 text-reu">Chưa rõ</p>}
          <Relatives title="Con" people={u.children} onSelect={onSelect} nested />
          {canEdit && (
            <button type="button" className="mt-2 text-sm font-medium text-son hover:underline" onClick={() => setMode({ kind: "add", relative: "child", unionId: u.id })}>
              Thêm con{u.partner ? ` với ${shortName(u.partner.fullName)}` : ""}
            </button>
          )}
        </section>
      ))}

      {canEdit && (
        <div className="mt-8 space-y-3 border-t border-ngoc-100 pt-6">
          <div className="grid grid-cols-2 gap-2">
            {p.unions.length === 0 && (
              <button type="button" className="btn-chinh" onClick={() => setMode({ kind: "add", relative: "child" })}>
                Thêm con
              </button>
            )}
            <button type="button" className={p.unions.length === 0 ? "btn-phu" : "btn-chinh"} onClick={() => setMode({ kind: "add", relative: "spouse" })}>
              Thêm {p.gender === "female" ? "chồng" : p.gender === "male" ? "vợ" : "vợ/chồng"}
            </button>
            {!hasParents && (
              <button type="button" className="btn-phu" onClick={() => setMode({ kind: "add", relative: "parent" })}>
                Thêm cha/mẹ
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-phu flex-1" onClick={() => setMode({ kind: "edit" })}>
              Sửa thông tin
            </button>
            {!isRoot && (
              <button type="button" className="btn-nguy" onClick={() => setMode({ kind: "delete", needsConfirm: false })}>
                Xoá
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const OTHER_NAME: Record<string, string> = { huy: "Tên huý", tu: "Tên tự", thuy: "Tên thuỵ", hieu: "Tên hiệu" };

const shortName = (name: string) => name.trim().split(/\s+/).slice(-1)[0] ?? name;

function PersonLink({ person, onSelect }: { person: PersonBrief; onSelect: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onSelect(person.id)} className="group mt-1 block text-left">
      <span className="font-serif text-lg text-then underline decoration-ngoc-300 underline-offset-4 group-hover:decoration-son">{person.fullName}</span>
      {person.birthYear ? <span className="ml-2 text-sm text-reu">sinh {person.birthYear}</span> : null}
    </button>
  );
}

function Relatives({
  title,
  people,
  onSelect,
  nested,
  empty,
}: {
  title: string;
  people: PersonBrief[];
  onSelect: (id: string) => void;
  nested?: boolean;
  empty?: string | undefined;
}) {
  if (people.length === 0 && !empty) return null;
  return (
    <section className={nested ? "mt-3 border-l-2 border-ngoc-200 pl-3" : "mt-6"}>
      <h3 className="text-sm font-medium text-reu">{title}</h3>
      {people.length === 0 ? <p className="mt-1 text-reu">{empty}</p> : people.map((x) => <PersonLink key={x.id} person={x} onSelect={onSelect} />)}
    </section>
  );
}

function EditPerson({ clanId, p, done }: { clanId: string; p: PersonDetail; done: () => void }) {
  const update = useUpdatePerson(clanId);
  const [conflict, setConflict] = useState(false);
  if (conflict) {
    return (
      <div className="space-y-4">
        <FormError message="Người khác vừa sửa thông tin này. Hãy xem bản mới nhất rồi sửa lại." />
        <button type="button" className="btn-phu w-full" onClick={done}>
          Xem bản mới nhất
        </button>
      </div>
    );
  }
  return (
    <PersonForm
      initial={p}
      submitLabel="Lưu thay đổi"
      onCancel={done}
      onSubmit={async (values) => {
        try {
          await update.mutateAsync({ id: p.id, patch: { ...values, version: p.version } });
          done();
        } catch (err) {
          if (err instanceof ApiError && err.code === "PERSON_VERSION_CONFLICT") setConflict(true);
          else throw err;
        }
      }}
    />
  );
}

function AddRelative({
  clanId,
  p,
  relative,
  unionId,
  onSelect,
  cancel,
}: {
  clanId: string;
  p: PersonDetail;
  relative: RelativeKind;
  unionId?: string | undefined;
  onSelect: (id: string) => void;
  cancel: () => void;
}) {
  const add = useAddPerson(clanId);
  // Gợi ý sẵn: vợ/chồng khác giới; cha mẹ — nam (cha) trước
  const gender: Gender = relative === "spouse" ? (p.gender === "male" ? "female" : "male") : "male";
  const lead =
    relative === "child"
      ? `Con của ${p.fullName}${unionId ? withPartner(p, unionId) : ""}`
      : relative === "spouse"
        ? `${p.gender === "female" ? "Chồng" : "Vợ"} của ${p.fullName}`
        : `Cha hoặc mẹ của ${p.fullName}`;
  return (
    <div>
      <p className="mb-5 font-serif text-lg">{lead}</p>
      <PersonForm
        // Cha mẹ của người đã mất chắc chắn cũng đã mất
        initial={{ gender, isLiving: relative === "parent" ? p.isLiving : true }}
        submitLabel={ADD_TITLE[relative]}
        onCancel={cancel}
        onSubmit={async (person) => {
          const res = await add.mutateAsync({ kind: relative, fromId: p.id, unionId, person });
          onSelect(res.person.id);
        }}
      />
    </div>
  );
}

function withPartner(p: PersonDetail, unionId: string) {
  const partner = p.unions.find((u) => u.id === unionId)?.partner;
  return partner ? ` và ${partner.fullName}` : "";
}

function DeletePerson({
  clanId,
  p,
  needsConfirm,
  setMode,
  onDeleted,
}: {
  clanId: string;
  p: PersonDetail;
  needsConfirm: boolean;
  setMode: (m: Mode) => void;
  onDeleted: () => void;
}) {
  const del = useDeletePerson(clanId);
  const [error, setError] = useState<string | null>(null);
  const childCount = p.unions.reduce((s, u) => s + u.children.length, 0);

  async function run() {
    setError(null);
    try {
      await del.mutateAsync({ id: p.id, confirm: needsConfirm || childCount > 0 });
      onDeleted();
    } catch (err) {
      if (err instanceof ApiError && err.code === "HAS_DESCENDANTS") setMode({ kind: "delete", needsConfirm: true });
      else setError(err instanceof Error ? err.message : "Không xoá được.");
    }
  }

  return (
    <div className="space-y-4">
      <p className="font-serif text-xl">Xoá {p.fullName} khỏi phả đồ?</p>
      {childCount > 0 ? (
        <p className="text-[0.95rem]">
          Người này có {childCount} người con. Con cháu vẫn được giữ lại trong phả đồ, chỉ mất liên kết với người này.
        </p>
      ) : (
        <p className="text-[0.95rem] text-reu">Dữ liệu không bị xoá hẳn khỏi hệ thống, ban quản lý có thể nhờ khôi phục khi cần.</p>
      )}
      <FormError message={error} />
      <div className="flex gap-3">
        <button type="button" className="btn flex-1 bg-loi text-white hover:bg-son-dam" onClick={run} disabled={del.isPending}>
          {del.isPending ? "Đang xoá…" : "Xoá người này"}
        </button>
        <button type="button" className="btn-phu" onClick={() => setMode({ kind: "view" })}>
          Huỷ
        </button>
      </div>
    </div>
  );
}

/** "Đây là tôi": gắn tài khoản với người trong phả — để tra xưng hô từ chính mình. */
function ThisIsMe({ clan, personId }: { clan: Clan; personId: string }) {
  const link = useLinkMe(clan.id);
  if (clan.myPersonId === personId) {
    return (
      <p className="mt-1 text-sm text-thep">
        Đây là bạn.{" "}
        <button type="button" className="underline underline-offset-2 hover:text-son" onClick={() => link.mutate(null)} disabled={link.isPending}>
          Không phải tôi
        </button>
      </p>
    );
  }
  if (clan.myPersonId) return null;
  return (
    <div className="mt-2">
      <button type="button" className="text-sm font-medium text-son hover:underline" onClick={() => link.mutate(personId)} disabled={link.isPending}>
        Đây là tôi
      </button>
      {link.error && <p className="mt-1 text-sm text-loi">{link.error.message}</p>}
    </div>
  );
}

/** Ảnh chân dung (ảnh thờ): xem, thêm, đổi, gỡ. Ảnh gốc mở được ở tab mới để tải về. */
function Portrait({ clanId, p, canEdit }: { clanId: string; p: PersonDetail; canEdit: boolean }) {
  const setAvatar = useSetAvatar(clanId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function choose(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const m = await uploadImage(clanId, file, `Ảnh ${p.fullName}`);
      await setAvatar.mutateAsync({ personId: p.id, mediaId: m.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được ảnh.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  if (!p.avatarMediaId && !canEdit) return null;
  const picker = (
    <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => void choose(e.target.files)} disabled={busy} />
  );
  return (
    <div className="mb-4">
      {p.avatarMediaId ? (
        <div className="flex items-end gap-4">
          <a href={mediaUrl(clanId, p.avatarMediaId, "lg")} target="_blank" rel="noreferrer" title="Xem ảnh lớn">
            <img
              src={mediaUrl(clanId, p.avatarMediaId, "md")}
              alt={`Ảnh chân dung ${p.fullName}`}
              className="h-36 w-28 rounded-md border border-ngoc-200 object-cover"
            />
          </a>
          {canEdit && (
            <div className="flex flex-col items-start gap-1 text-sm">
              <label className={`cursor-pointer font-medium text-son hover:underline ${busy ? "pointer-events-none opacity-50" : ""}`}>
                {picker}
                {busy ? "Đang tải…" : "Đổi ảnh"}
              </label>
              <button
                type="button"
                className="text-reu hover:text-loi hover:underline"
                onClick={() => setAvatar.mutate({ personId: p.id, mediaId: null })}
                disabled={busy || setAvatar.isPending}
              >
                Gỡ ảnh
              </button>
              <a href={mediaUrl(clanId, p.avatarMediaId, "orig")} className="text-reu hover:underline">
                Tải ảnh gốc
              </a>
            </div>
          )}
        </div>
      ) : (
        <label
          className={`flex h-24 w-full cursor-pointer items-center justify-center rounded-md border border-dashed border-ngoc-300 text-sm text-reu hover:border-son hover:text-son ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          {picker}
          {busy ? "Đang tải ảnh…" : "Thêm ảnh chân dung"}
        </label>
      )}
      {error && <p className="mt-1 text-sm text-loi">{error}</p>}
    </div>
  );
}
