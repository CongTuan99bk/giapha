"use client";

import { useHydrated } from "@/lib/use-hydrated";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Field, FormError } from "@/components/field";
import { api, ApiError, fieldErrors } from "@/lib/api";

function ResetForm() {
  const hydrated = useHydrated();
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("ma") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    setError(null);
    setFields({});
    if (password !== confirm) {
      setFields({ confirm: "Hai lần nhập mật khẩu chưa giống nhau" });
      return;
    }
    setPending(true);
    try {
      await api("POST", "/auth/reset-password", { token, password });
      router.replace("/dang-nhap?da-doi-mat-khau=1");
    } catch (err) {
      if (err instanceof ApiError && err.code === "RESET_LINK_INVALID") setExpired(true);
      const fe = fieldErrors(err);
      setFields(fe);
      if (Object.keys(fe).length === 0) setError(err instanceof Error ? err.message : "Không đặt lại được mật khẩu.");
      setPending(false);
    }
  }

  if (!token || expired) {
    return (
      <div className="space-y-4">
        <FormError message={expired ? error : "Link không đầy đủ. Hãy mở lại đúng link trong email hoặc tin nhắn."} />
        <Link href="/quen-mat-khau" className="btn-chinh w-full">
          Yêu cầu link mới
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormError message={error} />
      <Field
        label="Mật khẩu mới"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        error={fields.password}
        hint="Ít nhất 8 ký tự."
      />
      <Field label="Nhập lại mật khẩu mới" name="confirm" type="password" autoComplete="new-password" required error={fields.confirm} />
      <button type="submit" className="btn-chinh w-full" disabled={!hydrated || pending}>
        {pending ? "Đang lưu…" : "Đặt mật khẩu mới"}
      </button>
      <p className="text-sm text-reu">Đặt xong, bạn sẽ được đăng xuất khỏi mọi thiết bị khác để bảo đảm an toàn.</p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Đặt mật khẩu mới">
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
