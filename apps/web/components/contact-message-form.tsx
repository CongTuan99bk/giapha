"use client";

import { type FormEvent, useState } from "react";
import { Field, FormError } from "@/components/field";
import { api, fieldErrors } from "@/lib/api";

/** Khách gửi lời nhắn cho ban quản lý (hỏi ngày giỗ, xin bổ sung gia phả…) */
export function ContactMessageForm() {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setSending(true);
    setError(null);
    try {
      await api("POST", "/public/messages", { name: data.name, replyTo: data.replyTo, message: data.message, website: data.website || undefined });
      setSentTo(data.replyTo ?? "");
      form.reset();
    } catch (err) {
      setError(err);
    } finally {
      setSending(false);
    }
  }

  if (sentTo !== null) {
    return (
      <div role="status" className="rounded-md border border-thep/50 bg-thep-nhat px-5 py-4">
        <p className="font-serif text-xl">Đã gửi lời nhắn.</p>
        <p className="mt-1 text-reu">Ban quản lý sẽ liên lạc lại qua {sentTo}.</p>
        <button type="button" className="mt-3 text-sm font-medium text-son underline-offset-4 hover:underline" onClick={() => setSentTo(null)}>
          Gửi lời nhắn khác
        </button>
      </div>
    );
  }

  const errs = fieldErrors(error);
  const general = error && Object.keys(errs).length === 0 ? (error as Error).message : null;
  return (
    <form onSubmit={submit} className="max-w-xl space-y-4" noValidate>
      <FormError message={general} />
      <Field label="Họ tên" name="name" autoComplete="name" required maxLength={120} error={errs.name} />
      <Field
        label="Số điện thoại hoặc email"
        name="replyTo"
        autoComplete="tel"
        required
        maxLength={254}
        error={errs.replyTo}
        hint="Để ban quản lý liên lạc lại. Không hiện công khai."
      />
      <label className="block">
        <span className="nhan">Lời nhắn</span>
        <textarea
          name="message"
          required
          rows={4}
          maxLength={4000}
          className="o-nhap"
          placeholder="Ví dụ: con cháu chi hai ở Sài Gòn, xin bổ sung tên các cháu vào phả"
          aria-invalid={Boolean(errs.message)}
          aria-describedby={errs.message ? "loi-nhan-loi" : undefined}
        />
        {errs.message && (
          <span id="loi-nhan-loi" className="mt-1 block text-sm text-loi">
            {errs.message}
          </span>
        )}
      </label>
      {/* Ô bẫy chống máy gửi tự động: người dùng không thấy, không đọc tới */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Trang web
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <button type="submit" className="btn-chinh" disabled={sending}>
        {sending ? "Đang gửi…" : "Gửi lời nhắn"}
      </button>
    </form>
  );
}
