"use client";

import { useParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Field, FormError } from "@/components/field";
import { PersonPicker } from "@/components/person-picker";
import { fieldErrors } from "@/lib/api";
import {
  useClan,
  useCreateInvitation,
  useInvitations,
  useMe,
  useMembers,
  usePerson,
  useRemoveMember,
  useRevokeInvitation,
  useUpdateClan,
  useUpdateMember,
} from "@/lib/queries";
import { canManage, grantableRoles, ROLE_HINT, ROLE_LABEL, ROLE_RANK } from "@/lib/roles";
import type { Clan, GrantableRole, Invitation, PersonListItem } from "@/lib/types";

export default function SettingsPage() {
  const { clanId } = useParams<{ clanId: string }>();
  const clan = useClan(clanId);
  if (!clan.data) return null;
  if (ROLE_RANK[clan.data.role] < ROLE_RANK.admin) {
    return <p className="mx-auto max-w-md p-10 text-center font-serif text-xl text-reu">Chỉ ban quản lý dòng họ mới vào được phần cài đặt.</p>;
  }
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-8">
        <h1 className="font-serif text-3xl">Cài đặt dòng họ</h1>
        <Section title="Mời người vào dòng họ" lead="Tạo link rồi gửi qua Zalo, Messenger hoặc email. Người nhận mở link, tạo tài khoản là vào được.">
          <InviteForm clan={clan.data} />
          <ActiveInvitations clanId={clanId} />
        </Section>
        <Section title="Thành viên">
          <MemberList clan={clan.data} />
        </Section>
        <Section title="Thông tin dòng họ">
          <ClanInfoForm clan={clan.data} />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="mt-12 border-t border-ngoc-200 pt-8">
      <h2 className="font-serif text-2xl">{title}</h2>
      {lead && <p className="mt-1 max-w-prose text-reu">{lead}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Chip({ active, children, ...rest }: { active: boolean; children: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label
      className={`inline-flex min-h-11 cursor-pointer flex-col justify-center rounded-md border px-4 py-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-thep ${
        active ? "border-son bg-son-nhat text-son-dam" : "border-ngoc-300 bg-giay hover:bg-ngoc-100"
      }`}
    >
      <input type="radio" className="sr-only" checked={active} {...rest} />
      {children}
    </label>
  );
}

// ───────────── Lời mời ─────────────

function InviteForm({ clan }: { clan: Clan }) {
  const create = useCreateInvitation(clan.id);
  const roles = grantableRoles(clan.role);
  const [role, setRole] = useState<GrantableRole>("member");
  const [days, setDays] = useState(7);
  const [uses, setUses] = useState(1);
  const [email, setEmail] = useState("");
  const [person, setPerson] = useState<PersonListItem | null>(null);
  const [created, setCreated] = useState<Invitation | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    try {
      const inv = await create.mutateAsync({
        role,
        expiresInDays: days,
        maxUses: uses,
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(person ? { personId: person.id } : {}),
      });
      setCreated(inv);
      setEmail("");
      setPerson(null);
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      if (Object.keys(fe).length === 0) setFormError(err instanceof Error ? err.message : "Không tạo được lời mời.");
    }
  }

  if (created?.token) return <CreatedLink invitation={created} onDone={() => setCreated(null)} />;

  return (
    <form onSubmit={submit} className="space-y-6 rounded-lg border border-ngoc-200 bg-giay p-5" noValidate>
      <FormError message={formError} />
      <fieldset>
        <legend className="nhan">Vai trò của người được mời</legend>
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <Chip key={r} name="vai-tro" active={role === r} onChange={() => setRole(r)}>
              <span className="font-medium">{ROLE_LABEL[r]}</span>
              <span className="text-sm text-reu">{ROLE_HINT[r]}</span>
            </Chip>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="nhan">Link dùng được trong</span>
          <select className="o-nhap" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>1 ngày</option>
            <option value={7}>7 ngày</option>
            <option value={30}>30 ngày</option>
          </select>
        </label>
        <label>
          <span className="nhan">Số người dùng được link</span>
          <select className="o-nhap" value={uses} onChange={(e) => setUses(Number(e.target.value))}>
            <option value={1}>1 người</option>
            <option value={10}>Tối đa 10 người</option>
            <option value={50}>Tối đa 50 người (gửi vào nhóm)</option>
          </select>
        </label>
      </div>
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-son">Tuỳ chọn thêm</summary>
        <div className="mt-4 space-y-4">
          <Field
            label="Chỉ dành cho email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            hint="Để trống thì ai có link cũng dùng được."
          />
          <PersonPicker clanId={clan.id} label="Người được mời là ai trong phả" value={person} onChange={setPerson} />
          {errors.personId && <p className="text-sm text-loi">{errors.personId}</p>}
        </div>
      </details>
      <button type="submit" className="btn-chinh" disabled={create.isPending}>
        {create.isPending ? "Đang tạo…" : "Tạo link mời"}
      </button>
    </form>
  );
}

function CreatedLink({ invitation, onDone }: { invitation: Invitation; onDone: () => void }) {
  const url = `${typeof window === "undefined" ? "" : window.location.origin}/moi/${invitation.token}`;
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-lg border border-thep bg-thep-nhat/60 p-5" role="status">
      <p className="font-serif text-xl">Đã tạo link mời {ROLE_LABEL[invitation.role].toLowerCase()}</p>
      <p className="mt-1 text-sm text-reu">
        Link chỉ hiện một lần. Sao chép và gửi ngay; nếu làm mất, hãy tạo link mới.
      </p>
      <input
        aria-label="Link mời"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="o-nhap mt-4 font-mono text-sm"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-chinh" onClick={copy}>
          {copied ? "Đã sao chép" : "Sao chép link"}
        </button>
        {canShare && (
          <button type="button" className="btn-phu" onClick={() => navigator.share({ title: "Lời mời vào gia phả", url }).catch(() => undefined)}>
            Gửi…
          </button>
        )}
        <button type="button" className="btn-phu" onClick={onDone}>
          Tạo link khác
        </button>
      </div>
    </div>
  );
}

function ActiveInvitations({ clanId }: { clanId: string }) {
  const list = useInvitations(clanId);
  const revoke = useRevokeInvitation(clanId);
  if (!list.data || list.data.length === 0) return null;
  return (
    <div className="mt-8">
      <h3 className="text-sm font-medium text-reu">Link mời còn hiệu lực</h3>
      <ul className="mt-2 divide-y divide-ngoc-200 border-y border-ngoc-200">
        {list.data.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="text-[0.95rem]">
              <span className="font-medium">{ROLE_LABEL[i.role]}</span>
              <span className="text-reu">
                , đã dùng {i.useCount}/{i.maxUses}, hết hạn {new Date(i.expiresAt).toLocaleDateString("vi-VN")}
              </span>
              {(i.email || i.person) && (
                <span className="block text-sm text-reu">
                  {i.email ? `Cho ${i.email}` : ""}
                  {i.email && i.person ? ", " : ""}
                  {i.person ? `là ${i.person.fullName} trong phả` : ""}
                </span>
              )}
            </div>
            <button type="button" className="btn-nguy" onClick={() => revoke.mutate(i.id)} disabled={revoke.isPending}>
              Huỷ link
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────── Thành viên ─────────────

function MemberList({ clan }: { clan: Clan }) {
  const members = useMembers(clan.id);
  const me = useMe();
  const update = useUpdateMember(clan.id);
  const remove = useRemoveMember(clan.id);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roles = grantableRoles(clan.role);

  if (members.error) return <FormError message={members.error.message} />;
  if (!members.data) return <p className="text-reu">Đang tải…</p>;
  return (
    <>
      <FormError message={error} />
      <ul className="divide-y divide-ngoc-200 border-y border-ngoc-200">
        {members.data.map((m) => {
          const self = m.userId === me.data?.id;
          const editable = !self && canManage(clan.role, m.role);
          return (
            <li key={m.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <p className="font-serif text-lg">
                  {m.name}
                  {self && <span className="ml-2 font-sans text-sm text-reu">(bạn)</span>}
                </p>
                <p className="truncate text-sm text-reu">{m.email}</p>
                {m.person && <p className="text-sm text-reu">Trong phả: {m.person.fullName}</p>}
              </div>
              <div className="flex items-center gap-2">
                {editable ? (
                  <select
                    aria-label={`Vai trò của ${m.name}`}
                    className="o-nhap w-auto"
                    value={m.role}
                    onChange={(e) => {
                      setError(null);
                      update.mutate({ id: m.id, role: e.target.value as GrantableRole }, { onError: (err) => setError(err.message) });
                    }}
                  >
                    {/* Vai trò hiện tại có thể cao hơn những vai trò mình cấp được (vd. quản trị khác) — giữ để hiển thị đúng */}
                    {[...new Set([m.role, ...roles])].map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="px-3 text-[0.95rem]">{ROLE_LABEL[m.role]}</span>
                )}
                {editable &&
                  (confirming === m.id ? (
                    <>
                      <button
                        type="button"
                        className="btn bg-loi text-white hover:bg-son-dam"
                        onClick={() =>
                          remove.mutate(m.id, { onError: (err) => setError(err.message), onSettled: () => setConfirming(null) })
                        }
                      >
                        Xoá khỏi dòng họ
                      </button>
                      <button type="button" className="btn-phu" onClick={() => setConfirming(null)}>
                        Huỷ
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn-nguy" onClick={() => setConfirming(m.id)}>
                      Xoá
                    </button>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ───────────── Thông tin dòng họ ─────────────

const VARIANTS = [
  { value: "trung", label: "Miền Trung (ba/mạ, o, dượng)" },
  { value: "bac", label: "Miền Bắc (bố/mẹ, cô, chú)" },
  { value: "nam", label: "Miền Nam (ba/má, cô, dượng)" },
] as const;

function ClanInfoForm({ clan }: { clan: Clan }) {
  const update = useUpdateClan(clan.id);
  const root = usePerson(clan.id, clan.rootPersonId);
  const [name, setName] = useState(clan.name);
  const [surname, setSurname] = useState(clan.surname);
  const [origin, setOrigin] = useState(clan.originPlace ?? "");
  const [variant, setVariant] = useState(clan.kinshipVariant);
  const [newRoot, setNewRoot] = useState<PersonListItem | null>(null);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    setErrors({});
    setFormError(null);
    try {
      await update.mutateAsync({
        name: name.trim(),
        surname: surname.trim(),
        originPlace: origin.trim() || null,
        kinshipVariant: variant,
        ...(newRoot ? { rootPersonId: newRoot.id } : {}),
      });
      setNewRoot(null);
      setSaved(true);
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      if (Object.keys(fe).length === 0) setFormError(err instanceof Error ? err.message : "Không lưu được.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <FormError message={formError} />
      <Field label="Tên dòng họ" name="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Họ" name="surname" value={surname} onChange={(e) => setSurname(e.target.value)} error={errors.surname} />
        <Field label="Quê gốc" name="originPlace" value={origin} onChange={(e) => setOrigin(e.target.value)} error={errors.originPlace} />
      </div>
      <label className="block">
        <span className="nhan">Cách xưng hô</span>
        <select className="o-nhap" value={variant} onChange={(e) => setVariant(e.target.value as Clan["kinshipVariant"])}>
          {VARIANTS.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <div>
        <span className="nhan">Thuỷ tổ (đời 1)</span>
        <p className="mb-2 font-serif text-lg">{root.data?.fullName ?? "Chưa có"}</p>
        <PersonPicker clanId={clan.id} label="Đổi thuỷ tổ — đời của mọi người sẽ được tính lại" value={newRoot} onChange={setNewRoot} />
      </div>
      <div className="flex items-center gap-4">
        <button type="submit" className="btn-chinh" disabled={update.isPending}>
          {update.isPending ? "Đang lưu…" : "Lưu thông tin"}
        </button>
        {saved && (
          <span role="status" className="text-sm text-reu">
            Đã lưu
          </span>
        )}
      </div>
    </form>
  );
}
