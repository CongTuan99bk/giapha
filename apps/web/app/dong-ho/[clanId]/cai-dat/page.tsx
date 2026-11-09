"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { ContactsManager } from "@/components/contacts-manager";
import { Field, FormError } from "@/components/field";
import { HomeSettingsForm } from "@/components/home-settings-form";
import { MessagesInbox } from "@/components/messages-inbox";
import { PersonPicker } from "@/components/person-picker";
import { api, fieldErrors } from "@/lib/api";
import { formatPhone, loginLabel } from "@/lib/format";
import {
  useClan,
  useCreateAccount,
  useCreateInvitation,
  useDecideJoinRequest,
  useInvitations,
  useJoinRequests,
  useMe,
  useMembers,
  usePerson,
  useRemoveMember,
  useRevokeInvitation,
  useUpdateClan,
  useUpdateMember,
} from "@/lib/queries";
import { canManage, grantableRoles, ROLE_HINT, ROLE_LABEL, ROLE_RANK } from "@/lib/roles";
import type { Clan, GrantableRole, Invitation, JoinRequest, PersonListItem } from "@/lib/types";

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
        <p className="mt-2 text-reu">
          Nhập cả phả từ file Excel, in phả đồ, xuất danh sách:{" "}
          <Link href={`/dong-ho/${clanId}/nhap-xuat`} className="font-medium text-son underline-offset-4 hover:underline">
            Nhập – xuất
          </Link>
        </p>
        <JoinRequestsSection clan={clan.data} />
        <MessagesInbox clanId={clanId} />
        <Section id="them-nguoi" title="Thêm người vào dòng họ">
          <AddPeople clan={clan.data} />
        </Section>
        <Section id="trang-chu" title="Trang chủ" lead="Ảnh banner tự trượt, câu đối và khẩu hiệu hiện ở thẻ Trang chủ cho mọi thành viên.">
          <HomeSettingsForm clanId={clanId} />
        </Section>
        <Section
          id="lien-he"
          title="Ban liên lạc"
          lead="Trưởng họ, trưởng các chi, quản trị website — hiện ở mục Liên hệ trên trang công khai, theo đúng thứ tự dưới đây."
        >
          <ContactsManager clanId={clanId} />
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

function Section({ id, title, lead, children }: { id?: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-4 border-t border-ngoc-200 pt-8">
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

// ───────────── Yêu cầu tham gia ─────────────

function JoinRequestsSection({ clan }: { clan: Clan }) {
  const list = useJoinRequests(clan.id);
  if (!list.data || list.data.length === 0) return null;
  return (
    <Section
      id="yeu-cau"
      title={`Yêu cầu tham gia (${list.data.length})`}
      lead="Những người tự tạo tài khoản và xin vào dòng họ. Duyệt thì họ vào được ngay với vai trò bạn chọn."
    >
      <ul className="divide-y divide-ngoc-200 border-y border-ngoc-200">
        {list.data.map((r) => (
          <JoinRequestRow key={r.id} clan={clan} request={r} />
        ))}
      </ul>
    </Section>
  );
}

function JoinRequestRow({ clan, request: r }: { clan: Clan; request: JoinRequest }) {
  const decide = useDecideJoinRequest(clan.id);
  const roles = grantableRoles(clan.role);
  const [role, setRole] = useState<GrantableRole>("member");
  const [person, setPerson] = useState<PersonListItem | null>(null);
  return (
    <li className="space-y-3 py-4">
      <div>
        <p className="font-serif text-lg">{r.name}</p>
        <p className="text-sm text-reu">
          {loginLabel(r)}, gửi lúc {new Date(r.createdAt).toLocaleString("vi-VN")}
        </p>
        {r.message && <p className="mt-1 border-l-2 border-thep pl-3">{r.message}</p>}
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium text-son">Gắn với người trong phả</summary>
        <div className="mt-3">
          <PersonPicker clanId={clan.id} label={`${r.name} là ai trong phả`} value={person} onChange={setPerson} />
        </div>
      </details>
      <FormError message={decide.error?.message} />
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={`Vai trò cho ${r.name}`} className="o-nhap w-auto" value={role} onChange={(e) => setRole(e.target.value as GrantableRole)}>
          {roles.map((x) => (
            <option key={x} value={x}>
              {ROLE_LABEL[x]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-chinh"
          disabled={decide.isPending}
          onClick={() => decide.mutate({ id: r.id, approve: true, role, ...(person && { personId: person.id }) })}
        >
          Duyệt {r.name}
        </button>
        <button type="button" className="btn-nguy" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, approve: false })}>
          Từ chối
        </button>
      </div>
    </li>
  );
}

// ───────────── Thêm người: tạo tài khoản hộ hoặc gửi link mời ─────────────

function AddPeople({ clan }: { clan: Clan }) {
  const [mode, setMode] = useState<"account" | "invite">("account");
  return (
    <>
      <fieldset className="mb-6">
        <legend className="sr-only">Cách thêm người</legend>
        <div className="flex flex-wrap gap-2">
          <Chip name="cach-them" active={mode === "account"} onChange={() => setMode("account")}>
            <span className="font-medium">Tạo tài khoản giúp</span>
            <span className="text-sm text-reu">Cho người lớn tuổi, ít dùng điện thoại</span>
          </Chip>
          <Chip name="cach-them" active={mode === "invite"} onChange={() => setMode("invite")}>
            <span className="font-medium">Gửi link mời</span>
            <span className="text-sm text-reu">Người nhận tự tạo tài khoản</span>
          </Chip>
        </div>
      </fieldset>
      {mode === "account" ? (
        <AccountForm clan={clan} />
      ) : (
        <>
          <InviteForm clan={clan} />
          <ActiveInvitations clanId={clan.id} />
        </>
      )}
    </>
  );
}

function AccountForm({ clan }: { clan: Clan }) {
  const create = useCreateAccount(clan.id);
  const roles = grantableRoles(clan.role);
  const [role, setRole] = useState<GrantableRole>("member");
  const [person, setPerson] = useState<PersonListItem | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; login: string; url: string; expiresAt: string } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setErrors({});
    setFormError(null);
    try {
      const res = await create.mutateAsync({
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
        email: String(form.get("email") ?? ""),
        role,
        ...(person ? { personId: person.id } : {}),
      });
      setCreated({
        name: res.member.name,
        login: res.member.phone ? formatPhone(res.member.phone) : (res.member.email ?? ""),
        url: `${window.location.origin}${res.setPassword.path}`,
        expiresAt: res.setPassword.expiresAt,
      });
      setPerson(null);
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      if (Object.keys(fe).length === 0) setFormError(err instanceof Error ? err.message : "Không tạo được tài khoản.");
    }
  }

  if (created) return <CreatedAccount {...created} clanName={clan.name} onDone={() => setCreated(null)} />;

  return (
    <form onSubmit={submit} className="space-y-5 rounded-lg border border-ngoc-200 bg-giay p-5" noValidate>
      <FormError message={formError} />
      <Field label="Họ và tên" name="name" required error={errors.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Số điện thoại" name="phone" type="tel" inputMode="tel" error={errors.phone} hint="Người này đăng nhập bằng số này." />
        <Field label="Email (không bắt buộc)" name="email" type="email" error={errors.email} />
      </div>
      <fieldset>
        <legend className="nhan">Vai trò</legend>
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <Chip key={r} name="vai-tro-tai-khoan" active={role === r} onChange={() => setRole(r)}>
              <span className="font-medium">{ROLE_LABEL[r]}</span>
              <span className="text-sm text-reu">{ROLE_HINT[r]}</span>
            </Chip>
          ))}
        </div>
      </fieldset>
      <PersonPicker clanId={clan.id} label="Người này là ai trong phả (không bắt buộc)" value={person} onChange={setPerson} />
      {errors.personId && <p className="text-sm text-loi">{errors.personId}</p>}
      <button type="submit" className="btn-chinh" disabled={create.isPending}>
        {create.isPending ? "Đang tạo…" : "Tạo tài khoản"}
      </button>
    </form>
  );
}

/** Tài khoản vừa tạo: soạn sẵn tin nhắn kèm link đặt mật khẩu để gửi qua Zalo */
function CreatedAccount({ name, login, url, expiresAt, clanName, onDone }: { name: string; login: string; url: string; expiresAt: string; clanName: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const until = new Date(expiresAt).toLocaleDateString("vi-VN");
  const text = `Chào ${name}, ban quản lý đã tạo tài khoản gia phả ${clanName} cho bạn.\nBước 1: mở link sau để đặt mật khẩu (dùng được tới ${until}):\n${url}\nBước 2: đăng nhập bằng ${login} và mật khẩu vừa đặt.`;
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  return (
    <div className="rounded-lg border border-thep bg-thep-nhat/60 p-5" role="status">
      <p className="font-serif text-xl">Đã tạo tài khoản cho {name}</p>
      <p className="mt-1 text-sm text-reu">
        Gửi tin nhắn dưới đây qua Zalo. Link chỉ hiện một lần; làm mất thì vào danh sách Thành viên, bấm “Tạo link đặt mật khẩu”.
      </p>
      <textarea aria-label="Tin nhắn gửi kèm link đặt mật khẩu" readOnly rows={5} value={text} onFocus={(e) => e.currentTarget.select()} className="o-nhap mt-4 text-sm" />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-chinh"
          onClick={() =>
            navigator.clipboard
              .writeText(text)
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }
        >
          {copied ? "Đã sao chép" : "Sao chép tin nhắn"}
        </button>
        {canShare && (
          <button type="button" className="btn-phu" onClick={() => navigator.share({ title: "Tài khoản gia phả", text }).catch(() => undefined)}>
            Gửi…
          </button>
        )}
        <button type="button" className="btn-phu" onClick={onDone}>
          Tạo tài khoản khác
        </button>
      </div>
    </div>
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
                <p className="truncate text-sm text-reu">{loginLabel(m)}</p>
                {m.person && <p className="text-sm text-reu">Trong phả: {m.person.fullName}</p>}
                {m.passwordPending && <p className="text-sm font-medium text-son-dam">Chưa đặt mật khẩu lần đầu</p>}
                {editable && <ResetLink clanId={clan.id} memberId={m.id} name={m.name} firstTime={m.passwordPending} />}
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

/** Tạo link đặt lại mật khẩu hộ thành viên — gửi qua Zalo cho người không dùng email. */
function ResetLink({ clanId, memberId, name, firstTime }: { clanId: string; memberId: string; name: string; firstTime: boolean }) {
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function create() {
    setPending(true);
    setError(null);
    try {
      const res = await api<{ path: string; expiresAt: string }>("POST", `/clans/${clanId}/members/${memberId}/password-reset`);
      setLink({ url: `${window.location.origin}${res.path}`, expiresAt: res.expiresAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được link.");
    } finally {
      setPending(false);
    }
  }

  if (link) {
    return (
      <div className="mt-2 rounded-md border border-thep bg-thep-nhat/60 p-3 text-sm" role="status">
        <p>
          Link {firstTime ? "đặt mật khẩu" : "đặt lại mật khẩu"} cho {name}, dùng được tới {new Date(link.expiresAt).toLocaleString("vi-VN")}. Chỉ hiện một lần:
        </p>
        <input
          aria-label={`Link đặt lại mật khẩu của ${name}`}
          readOnly
          value={link.url}
          onFocus={(e) => e.currentTarget.select()}
          className="o-nhap mt-2 font-mono text-xs"
        />
        <button
          type="button"
          className="mt-2 font-medium text-son hover:underline"
          onClick={() =>
            navigator.clipboard
              .writeText(link.url)
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }
        >
          {copied ? "Đã sao chép" : "Sao chép link"}
        </button>
      </div>
    );
  }
  return (
    <div className="mt-1">
      <button type="button" className="text-sm text-son hover:underline" onClick={create} disabled={pending}>
        {pending ? "Đang tạo…" : firstTime ? "Tạo link đặt mật khẩu" : "Tạo link đặt lại mật khẩu"}
      </button>
      {error && <p className="text-sm text-loi">{error}</p>}
    </div>
  );
}
