"use client";

import { type InputHTMLAttributes, type ReactNode, useState } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
}

/** Ô nhập có nhãn, gợi ý và lỗi gắn với aria-describedby. Ô mật khẩu có nút Hiện/Ẩn. */
export function Field({ label, error, hint, id, name, type, ...rest }: FieldProps) {
  const fid = id ?? name;
  const describedBy = error ? `${fid}-loi` : hint ? `${fid}-goiy` : undefined;
  const isPassword = type === "password";
  const [shown, setShown] = useState(false);
  const input = (
    <input
      id={fid}
      name={name}
      type={isPassword && shown ? "text" : type}
      className={isPassword ? "o-nhap pr-20" : "o-nhap"}
      aria-invalid={Boolean(error)}
      aria-describedby={describedBy}
      {...(isPassword && { autoCapitalize: "none", autoCorrect: "off", spellCheck: false })}
      {...rest}
    />
  );
  return (
    <div>
      <label htmlFor={fid} className="nhan">
        {label}
      </label>
      {isPassword ? (
        <div className="relative">
          {input}
          {/* Nút không có aria-label để không trùng nhãn "Mật khẩu" của ô nhập; tên đọc được = chữ trong nút */}
          <button
            type="button"
            className="absolute inset-y-1 right-1 flex items-center gap-1.5 rounded px-2.5 text-sm font-medium text-thep hover:bg-ngoc-100 focus-visible:outline-2 focus-visible:outline-son"
            aria-pressed={shown}
            aria-controls={fid}
            onClick={() => setShown((s) => !s)}
          >
            <EyeIcon crossed={shown} />
            <span>
              {shown ? "Ẩn" : "Hiện"}
              <span className="sr-only"> mật khẩu</span>
            </span>
          </button>
        </div>
      ) : (
        input
      )}
      {error ? (
        <p id={`${fid}-loi`} className="mt-1 text-sm text-loi">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fid}-goiy`} className="mt-1 text-sm text-reu">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="M4 20 20 4" />}
    </svg>
  );
}

export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-loi/30 bg-son-nhat px-3 py-2 text-sm text-loi">
      {message}
    </p>
  );
}
