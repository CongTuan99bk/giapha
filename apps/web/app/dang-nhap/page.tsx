"use client";

import { useHydrated } from "@/lib/use-hydrated";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthShell } from "@/components/auth-shell";
import { Field, FormError } from "@/components/field";
import { api, ApiError, fieldErrors } from "@/lib/api";
import { keys } from "@/lib/queries";
import { safeNext } from "@/lib/redirect";
import type { User } from "@/lib/types";

function LoginForm() {
  const hydrated = useHydrated();
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const res = await api<{ user: User }>("POST", "/auth/login", {
        identifier: String(form.get("identifier") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      qc.setQueryData(keys.me, res.user);
      router.replace(safeNext(params.get("tiep")));
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "INVALID_CREDENTIALS"
          ? "Số điện thoại/email hoặc mật khẩu chưa đúng."
          : err instanceof ApiError && err.code === "VALIDATION_FAILED"
            ? (fieldErrors(err).identifier ?? err.message)
          : err instanceof Error
            ? err.message
            : "Không đăng nhập được.",
      );
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {params.get("da-doi-mat-khau") && (
        <p role="status" className="rounded-md border border-ngoc-300 bg-ngoc-100 px-3 py-2 text-sm">
          Đã đặt mật khẩu mới. Hãy đăng nhập bằng mật khẩu mới.
        </p>
      )}
      <FormError message={error} />
      <Field
        label="Số điện thoại hoặc email"
        name="identifier"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        hint="Ví dụ 0912 345 678"
      />
      <Field label="Mật khẩu" name="password" type="password" autoComplete="current-password" required />
      <p className="-mt-3 text-right text-sm">
        <Link href="/quen-mat-khau" className="text-son underline-offset-4 hover:underline">
          Quên mật khẩu?
        </Link>
      </p>
      <button type="submit" className="btn-chinh w-full" disabled={!hydrated || pending}>
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
      <p className="text-sm text-reu">
        Chưa có tài khoản?{" "}
        <Link href={params.get("tiep") ? `/dang-ky?tiep=${encodeURIComponent(safeNext(params.get("tiep")))}` : "/dang-ky"} className="font-medium text-son underline-offset-4 hover:underline">
          Tạo tài khoản
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell title="Đăng nhập">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
