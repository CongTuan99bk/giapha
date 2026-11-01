"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthShell } from "@/components/auth-shell";
import { Field, FormError } from "@/components/field";
import { RequireAuth } from "@/components/require-auth";
import { api, ApiError, fieldErrors } from "@/lib/api";
import { slugify } from "@/lib/format";
import { keys } from "@/lib/queries";

/** Lần đầu sử dụng: người đầu tiên tạo dòng họ và trở thành chủ sở hữu. */
function CreateClan() {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
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
      const clan = await api<{ id: string }>("POST", "/clans", {
        name: name.trim(),
        surname: String(form.get("surname") ?? "").trim(),
        originPlace: String(form.get("originPlace") ?? "").trim() || undefined,
        slug: slug || slugify(name),
      });
      await qc.invalidateQueries({ queryKey: keys.clans });
      router.replace(`/dong-ho/${clan.id}`);
    } catch (err) {
      const fe = fieldErrors(err);
      if (err instanceof ApiError && err.code === "SLUG_TAKEN") fe.slug = "Địa chỉ này đã có người dùng, hãy chọn địa chỉ khác.";
      setFields(fe);
      if (Object.keys(fe).length === 0) setError(err instanceof Error ? err.message : "Không tạo được dòng họ.");
      setPending(false);
    }
  }

  return (
    <AuthShell title="Tạo gia phả dòng họ">
      <p className="-mt-4 mb-6 text-reu">Bạn sẽ là người quản lý chính. Các thông tin này sửa lại được sau.</p>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <FormError message={error} />
        <Field
          label="Tên dòng họ"
          name="name"
          placeholder="Họ Nguyễn Văn – làng Phú Xuân"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          required
          error={fields.name}
        />
        <Field label="Họ" name="surname" placeholder="Nguyễn" required error={fields.surname} />
        <Field label="Quê gốc" name="originPlace" placeholder="Không bắt buộc" error={fields.originPlace} />
        <Field
          label="Địa chỉ trang dòng họ"
          name="slug"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toLowerCase());
          }}
          error={fields.slug}
          hint="Chữ thường không dấu, số và gạch ngang. Dùng làm địa chỉ website của dòng họ."
        />
        <button type="submit" className="btn-chinh w-full" disabled={pending || !name.trim()}>
          {pending ? "Đang tạo…" : "Tạo dòng họ"}
        </button>
      </form>
    </AuthShell>
  );
}

export default function StartPage() {
  return (
    <RequireAuth>
      <CreateClan />
    </RequireAuth>
  );
}
