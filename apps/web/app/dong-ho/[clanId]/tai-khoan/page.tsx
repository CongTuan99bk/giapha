"use client";

import { useParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Field, FormError } from "@/components/field";
import { fieldErrors } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import { useChangePassword, useClan, useMe, useUpdateMyAccount } from "@/lib/queries";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/roles";
import type { User } from "@/lib/types";

/** Tài khoản của tôi: họ tên, email, số điện thoại đăng nhập và đổi mật khẩu */
export default function AccountPage() {
  const { clanId } = useParams<{ clanId: string }>();
  const me = useMe();
  const clan = useClan(clanId);
  if (!me.data) return null;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-4 pb-20 pt-8">
        <h1 className="font-serif text-3xl">Tài khoản của tôi</h1>
        {clan.data && (
          <p className="mt-2 text-reu">
            Vai trò trong {clan.data.name}: <span className="font-medium text-then">{ROLE_LABEL[clan.data.role]}</span>
            {` — ${ROLE_HINT[clan.data.role].toLowerCase()}.`}
          </p>
        )}
        <Section title="Thông tin đăng nhập" lead="Đăng nhập bằng số điện thoại hoặc email dưới đây. Cần giữ ít nhất một trong hai.">
          <LoginForm user={me.data} />
        </Section>
        <Section title="Đổi mật khẩu" lead="Đổi xong, máy đang dùng vẫn đăng nhập; các máy khác phải đăng nhập lại bằng mật khẩu mới.">
          <PasswordForm />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <section className="mt-10 border-t border-ngoc-200 pt-8">
      <h2 className="font-serif text-2xl">{title}</h2>
      <p className="mt-1 max-w-prose text-reu">{lead}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function LoginForm({ user }: { user: User }) {
  const update = useUpdateMyAccount();
  const initial = { name: user.name, phone: formatPhone(user.phone), email: user.email ?? "" };
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [email, setEmail] = useState(initial.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // so trên chữ đã bỏ khoảng trắng: "0912 000 111" và "0912000111" là một số
  const norm = (v: string) => v.replace(/\s+/g, "");
  const phoneChanged = norm(phone) !== norm(initial.phone);
  const emailChanged = email.trim().toLowerCase() !== initial.email.toLowerCase();
  const loginChanged = phoneChanged || emailChanged;
  const nameChanged = name.trim() !== initial.name;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setSaved(false);
    if (!nameChanged && !loginChanged) {
      setFormError("Chưa có gì thay đổi.");
      return;
    }
    try {
      await update.mutateAsync({
        ...(nameChanged && { name: name.trim() }),
        ...(phoneChanged && { phone: phone.trim() || null }),
        ...(emailChanged && { email: email.trim() || null }),
        ...(loginChanged && { currentPassword }),
      });
      // thông tin mới về qua useMe → "initial" bằng giá trị đang nhập, các ô hết "đã thay đổi"
      setCurrentPassword("");
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
      <Field label="Họ và tên" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
      <Field
        label="Số điện thoại"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
        hint="Để trống nếu chỉ đăng nhập bằng email."
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        hint="Dùng để nhận link khi quên mật khẩu. Để trống nếu chỉ đăng nhập bằng số điện thoại."
      />
      {loginChanged && (
        <Field
          label="Mật khẩu hiện tại"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          error={errors.currentPassword}
          hint="Cần để đổi số điện thoại hoặc email đăng nhập."
        />
      )}
      <div className="flex items-center gap-4">
        <button type="submit" className="btn-chinh" disabled={update.isPending}>
          {update.isPending ? "Đang lưu…" : "Lưu thông tin"}
        </button>
        <SavedNote show={saved && !nameChanged && !loginChanged} text="Đã lưu thông tin" />
      </div>
    </form>
  );
}

function PasswordForm() {
  const change = useChangePassword();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    setErrors({});
    setFormError(null);
    setSaved(false);
    const local: Record<string, string> = {};
    if (!currentPassword) local.currentPassword = "Nhập mật khẩu hiện tại";
    if (newPassword.length < 8) local.newPassword = "Mật khẩu tối thiểu 8 ký tự";
    else if (newPassword === currentPassword) local.newPassword = "Mật khẩu mới phải khác mật khẩu hiện tại";
    if (newPassword !== String(form.get("confirm") ?? "")) local.confirm = "Hai lần nhập mật khẩu mới chưa giống nhau";
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    try {
      await change.mutateAsync({ currentPassword, newPassword });
      formEl.reset();
      setSaved(true);
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      if (Object.keys(fe).length === 0) setFormError(err instanceof Error ? err.message : "Không đổi được mật khẩu.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <FormError message={formError} />
      <Field label="Mật khẩu hiện tại" name="currentPassword" type="password" autoComplete="current-password" error={errors.currentPassword} />
      <Field label="Mật khẩu mới" name="newPassword" type="password" autoComplete="new-password" error={errors.newPassword} hint="Tối thiểu 8 ký tự." />
      <Field label="Nhập lại mật khẩu mới" name="confirm" type="password" autoComplete="new-password" error={errors.confirm} />
      <div className="flex items-center gap-4">
        <button type="submit" className="btn-chinh" disabled={change.isPending}>
          {change.isPending ? "Đang đổi…" : "Đổi mật khẩu"}
        </button>
        <SavedNote show={saved} text="Đã đổi mật khẩu. Các máy khác đã được đăng xuất." />
      </div>
    </form>
  );
}

function SavedNote({ show, text }: { show: boolean; text: string }) {
  return (
    <span role="status" className="text-sm text-reu">
      {show ? text : ""}
    </span>
  );
}
