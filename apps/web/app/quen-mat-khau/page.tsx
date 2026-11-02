"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Field, FormError } from "@/components/field";
import { api, fieldErrors } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    setPending(true);
    setError(null);
    setFields({});
    try {
      await api("POST", "/auth/forgot-password", { email });
      setSentTo(email);
    } catch (err) {
      const fe = fieldErrors(err);
      setFields(fe);
      if (Object.keys(fe).length === 0) setError(err instanceof Error ? err.message : "Không gửi được yêu cầu.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell title="Quên mật khẩu">
      {sentTo ? (
        <div className="space-y-4" role="status">
          <p>
            Nếu <strong>{sentTo}</strong> có tài khoản, một email có link đặt lại mật khẩu vừa được gửi tới. Link dùng được trong 30 phút.
          </p>
          <p className="text-sm text-reu">
            Không thấy email? Xem thư mục Spam/Quảng cáo. Hoặc nhờ ban quản lý dòng họ tạo link đặt lại mật khẩu và gửi cho bạn qua Zalo.
          </p>
          <Link href="/dang-nhap" className="btn-phu w-full">
            Về trang đăng nhập
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <p className="-mt-4 text-reu">Nhập email bạn dùng để đăng nhập. Chúng tôi gửi link để bạn đặt mật khẩu mới.</p>
          <FormError message={error} />
          <Field label="Email" name="email" type="email" autoComplete="email" required error={fields.email} />
          <button type="submit" className="btn-chinh w-full" disabled={pending}>
            {pending ? "Đang gửi…" : "Gửi link đặt lại mật khẩu"}
          </button>
          <p className="text-sm text-reu">
            Nhớ ra rồi?{" "}
            <Link href="/dang-nhap" className="font-medium text-son underline-offset-4 hover:underline">
              Đăng nhập
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
