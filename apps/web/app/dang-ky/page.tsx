"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthShell } from "@/components/auth-shell";
import { Field, FormError } from "@/components/field";
import { api, ApiError, fieldErrors } from "@/lib/api";
import { keys } from "@/lib/queries";
import type { User } from "@/lib/types";

export default function RegisterPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    setFields({});
    try {
      const res = await api<{ user: User }>("POST", "/auth/register", {
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      qc.setQueryData(keys.me, res.user);
      router.replace("/");
    } catch (err) {
      const fe = fieldErrors(err);
      setFields(fe);
      if (err instanceof ApiError && err.code === "EMAIL_TAKEN") setFields({ email: "Email này đã có tài khoản. Hãy đăng nhập." });
      else if (Object.keys(fe).length === 0) setError(err instanceof Error ? err.message : "Không tạo được tài khoản.");
      setPending(false);
    }
  }

  return (
    <AuthShell title="Tạo tài khoản">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <FormError message={error} />
        <Field label="Họ và tên" name="name" autoComplete="name" required error={fields.name} />
        <Field label="Email" name="email" type="email" autoComplete="email" required error={fields.email} />
        <Field
          label="Mật khẩu"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          error={fields.password}
          hint="Ít nhất 8 ký tự."
        />
        <button type="submit" className="btn-chinh w-full" disabled={pending}>
          {pending ? "Đang tạo…" : "Tạo tài khoản"}
        </button>
        <p className="text-sm text-reu">
          Đã có tài khoản?{" "}
          <Link href="/dang-nhap" className="font-medium text-son underline-offset-4 hover:underline">
            Đăng nhập
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
