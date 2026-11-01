import type { InputHTMLAttributes, ReactNode } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
}

/** Ô nhập có nhãn, gợi ý và lỗi gắn với aria-describedby. */
export function Field({ label, error, hint, id, name, ...rest }: FieldProps) {
  const fid = id ?? name;
  const describedBy = error ? `${fid}-loi` : hint ? `${fid}-goiy` : undefined;
  return (
    <div>
      <label htmlFor={fid} className="nhan">
        {label}
      </label>
      <input id={fid} name={name} className="o-nhap" aria-invalid={Boolean(error)} aria-describedby={describedBy} {...rest} />
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

export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-loi/30 bg-son-nhat px-3 py-2 text-sm text-loi">
      {message}
    </p>
  );
}
