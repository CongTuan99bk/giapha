"use client";

import { useState, type FormEvent } from "react";
import { fieldErrors } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import { useUpdateMemberAccount } from "@/lib/queries";
import type { Member } from "@/lib/types";
import { Field, FormError } from "./field";

/**
 * Quản trị sửa tài khoản của người có vai trò thấp hơn: họ tên, số điện thoại, email, đặt mật khẩu mới.
 * Mật khẩu mới do quản trị đặt: người đó bị đăng xuất khỏi mọi máy, đăng nhập lại bằng mật khẩu này.
 */
export function MemberAccountForm({ clanId, member, onDone }: { clanId: string; member: Member; onDone: (message: string) => void }) {
  const update = useUpdateMemberAccount(clanId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const initial = { name: member.name, phone: formatPhone(member.phone), email: member.email ?? "" };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const newPassword = String(form.get("newPassword") ?? "");
    setErrors({});
    setFormError(null);
    const norm = (v: string) => v.replace(/\s+/g, "");
    const body = {
      ...(name !== initial.name && { name }),
      ...(norm(phone) !== norm(initial.phone) && { phone: phone || null }),
      ...(email.toLowerCase() !== initial.email.toLowerCase() && { email: email || null }),
      ...(newPassword && { newPassword }),
    };
    if (Object.keys(body).length === 0) {
      setFormError("Chưa có gì thay đổi.");
      return;
    }
    if (newPassword && newPassword.length < 8) {
      setErrors({ newPassword: "Mật khẩu tối thiểu 8 ký tự" });
      return;
    }
    try {
      const res = await update.mutateAsync({ id: member.id, ...body });
      onDone(res.passwordSet ? `Đã lưu. Báo ${res.name} đăng nhập lại bằng mật khẩu mới.` : `Đã lưu tài khoản của ${res.name}.`);
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      if (Object.keys(fe).length === 0) setFormError(err instanceof Error ? err.message : "Không lưu được.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-ngoc-200 bg-giay p-4" noValidate aria-label={`Sửa tài khoản của ${member.name}`}>
      <FormError message={formError} />
      <Field label="Họ và tên" name="name" defaultValue={initial.name} error={errors.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Số điện thoại" name="phone" type="tel" inputMode="tel" defaultValue={initial.phone} error={errors.phone} />
        <Field label="Email" name="email" type="email" defaultValue={initial.email} error={errors.email} />
      </div>
      <Field
        label="Mật khẩu mới (không bắt buộc)"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        error={errors.newPassword}
        hint="Để trống nếu không đổi. Đặt mật khẩu mới thì người này bị đăng xuất khỏi mọi máy."
      />
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-chinh" disabled={update.isPending}>
          {update.isPending ? "Đang lưu…" : "Lưu tài khoản"}
        </button>
        <button type="button" className="btn-phu" onClick={() => onDone("")}>
          Huỷ
        </button>
      </div>
    </form>
  );
}
