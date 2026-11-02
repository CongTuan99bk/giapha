"use client";

import { useHydrated } from "@/lib/use-hydrated";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthShell } from "@/components/auth-shell";
import { Field, FormError } from "@/components/field";
import { api, fieldErrors } from "@/lib/api";
import { keys, useInstance } from "@/lib/queries";
import { safeNext } from "@/lib/redirect";
import type { User } from "@/lib/types";

function RegisterForm() {
  const hydrated = useHydrated();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("tiep"));
  const qc = useQueryClient();
  const instance = useInstance();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  // Tự đăng ký vào dòng họ đã có (không qua link mời) → gửi yêu cầu, ban quản lý duyệt
  const needsApproval = !next.startsWith("/moi/") && Boolean(instance.data?.clan);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    setFields({});
    try {
      const res = await api<{ user: User }>("POST", "/auth/register", {
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      qc.setQueryData(keys.me, res.user);
      if (needsApproval) {
        // Lỗi ở bước này không chặn: trang chủ cho gửi lại yêu cầu
        await api("POST", "/instance/join-request", { message: String(form.get("message") ?? "").trim() || undefined }).catch(() => undefined);
      }
      router.replace(next);
    } catch (err) {
      const fe = fieldErrors(err);
      setFields(fe);
      if (Object.keys(fe).length === 0) setError(err instanceof Error ? err.message : "Không tạo được tài khoản.");
      setPending(false);
    }
  }

  return (
    <AuthShell title="Tạo tài khoản">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {needsApproval && (
          <p className="rounded-md border border-ngoc-300 bg-ngoc-100 px-3 py-2 text-sm">
            Ban quản lý {instance.data!.clan!.name} sẽ duyệt tài khoản trước khi bạn xem được gia phả.
          </p>
        )}
        <FormError message={error} />
        <Field label="Họ và tên" name="name" autoComplete="name" required error={fields.name} />
        <Field
          label="Số điện thoại"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          error={fields.phone}
          hint="Dùng để đăng nhập. Không có số điện thoại thì điền email bên dưới."
        />
        <Field
          label="Email (không bắt buộc)"
          name="email"
          type="email"
          autoComplete="email"
          error={fields.email}
          hint="Có email thì tự lấy lại được mật khẩu khi quên."
        />
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
        {needsApproval && (
          <label className="block">
            <span className="nhan">Bạn là ai trong họ? (không bắt buộc)</span>
            <textarea
              name="message"
              rows={2}
              maxLength={500}
              className="o-nhap"
              aria-describedby="loi-nhan-goiy"
              placeholder="Ví dụ: con ông Lê Văn Tư, chi hai"
            />
            <span id="loi-nhan-goiy" className="mt-1 block text-sm text-reu">
              Giúp ban quản lý nhận ra bạn để duyệt nhanh hơn.
            </span>
          </label>
        )}
        <button type="submit" className="btn-chinh w-full" disabled={!hydrated || pending}>
          {pending ? "Đang tạo…" : needsApproval ? "Tạo tài khoản và gửi yêu cầu" : "Tạo tài khoản"}
        </button>
        <p className="text-sm text-reu">
          Đã có tài khoản?{" "}
          <Link href={next === "/" ? "/dang-nhap" : `/dang-nhap?tiep=${encodeURIComponent(next)}`} className="font-medium text-son underline-offset-4 hover:underline">
            Đăng nhập
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
