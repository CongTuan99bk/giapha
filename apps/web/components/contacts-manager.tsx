"use client";

import { useId, useState, type FormEvent } from "react";
import { fieldErrors } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import { type ContactInput, useContacts, useDeleteContact, useReorderContacts, useSaveContact } from "@/lib/queries";
import type { Contact } from "@/lib/types";
import { Field, FormError } from "./field";

const ROLE_SUGGESTIONS = ["Trưởng họ", "Phó trưởng họ", "Trưởng chi 1", "Trưởng chi 2", "Thủ từ (trông nhà thờ họ)", "Thủ quỹ", "Quản trị website"];

/**
 * Ban liên lạc: trưởng họ, trưởng các chi, quản trị website.
 * Trang công khai luôn hiện tên + vai trò; số điện thoại/email chỉ hiện khi bật VÀ đã xác nhận người đó đồng ý.
 */
export function ContactsManager({ clanId }: { clanId: string }) {
  const list = useContacts(clanId);
  const reorder = useReorderContacts(clanId);
  const remove = useDeleteContact(clanId);
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (list.error) return <FormError message={list.error.message} />;
  const items = list.data ?? [];
  const move = (from: number, to: number) => {
    const ids = items.map((c) => c.id);
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x!);
    reorder.mutate(ids);
  };

  return (
    <div>
      {items.length > 0 && (
        <ul className="mb-6 divide-y divide-ngoc-200 border-y border-ngoc-200">
          {items.map((c, i) =>
            editing !== "new" && editing?.id === c.id ? (
              <li key={c.id} className="py-4">
                <ContactForm clanId={clanId} initial={c} done={() => setEditing(null)} />
              </li>
            ) : (
              <li key={c.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p>
                    <span className="font-serif text-lg">{c.name}</span>
                    <span className="ml-2 text-sm text-reu">{c.role}</span>
                  </p>
                  <p className="text-sm text-reu">{[formatPhone(c.phone), c.email].filter(Boolean).join(" · ") || "Chưa có số điện thoại, email"}</p>
                  <p className="text-sm">
                    {publicSummary(c)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <button type="button" aria-label={`Đưa ${c.name} lên trước`} className="h-9 w-9 rounded border border-ngoc-200 text-reu disabled:opacity-30" disabled={i === 0 || reorder.isPending} onClick={() => move(i, i - 1)}>
                    ↑
                  </button>
                  <button type="button" aria-label={`Đưa ${c.name} xuống sau`} className="h-9 w-9 rounded border border-ngoc-200 text-reu disabled:opacity-30" disabled={i === items.length - 1 || reorder.isPending} onClick={() => move(i, i + 1)}>
                    ↓
                  </button>
                  <button type="button" className="btn-phu" onClick={() => setEditing(c)}>
                    Sửa
                  </button>
                  {confirmDelete === c.id ? (
                    <button type="button" className="btn bg-loi text-white hover:bg-son-dam" onClick={() => remove.mutate(c.id, { onSettled: () => setConfirmDelete(null) })}>
                      Xoá {c.name}
                    </button>
                  ) : (
                    <button type="button" className="btn-nguy" onClick={() => setConfirmDelete(c.id)}>
                      Xoá
                    </button>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      {editing === "new" ? (
        <div className="rounded-lg border border-ngoc-200 bg-giay p-5">
          <ContactForm clanId={clanId} done={() => setEditing(null)} />
        </div>
      ) : (
        <button type="button" className="btn-phu" onClick={() => setEditing("new")}>
          Thêm người liên hệ
        </button>
      )}
    </div>
  );
}

function publicSummary(c: Contact): string {
  const shown = [c.showPhone && "số điện thoại", c.showEmail && "email"].filter(Boolean);
  if (!c.consent || shown.length === 0) return "Trang công khai: chỉ hiện tên và vai trò";
  return `Trang công khai: hiện ${shown.join(" và ")}`;
}

function ContactForm({ clanId, initial, done }: { clanId: string; initial?: Contact; done: () => void }) {
  const uid = useId();
  const save = useSaveContact(clanId);
  const [showPhone, setShowPhone] = useState(initial?.showPhone ?? true);
  const [showEmail, setShowEmail] = useState(initial?.showEmail ?? false);
  const [consent, setConsent] = useState(initial?.consent ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const phone = String(f.get("phone") ?? "").trim();
    const email = String(f.get("email") ?? "").trim();
    const data: ContactInput = {
      name: String(f.get("name") ?? ""),
      role: String(f.get("role") ?? ""),
      phone: phone || null,
      email: email || null,
      // chưa nhập thì không bật công khai trường đó
      showPhone: showPhone && Boolean(phone),
      showEmail: showEmail && Boolean(email),
      consent,
      consentNote: String(f.get("consentNote") ?? ""),
    };
    setErrors({});
    setFormError(null);
    try {
      await save.mutateAsync({ ...(initial && { id: initial.id }), data });
      done();
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      if (Object.keys(fe).length === 0) setFormError(err instanceof Error ? err.message : "Không lưu được.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Họ và tên" name="name" defaultValue={initial?.name} error={errors.name} />
        <div>
          <label htmlFor={`${uid}-vaitro`} className="nhan">
            Vai trò
          </label>
          <input id={`${uid}-vaitro`} name="role" list={`${uid}-goiy`} className="o-nhap" defaultValue={initial?.role} placeholder="Ví dụ: Trưởng họ" aria-invalid={Boolean(errors.role)} />
          <datalist id={`${uid}-goiy`}>
            {ROLE_SUGGESTIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          {errors.role && <p className="mt-1 text-sm text-loi">{errors.role}</p>}
        </div>
        <Field label="Số điện thoại" name="phone" type="tel" inputMode="tel" defaultValue={formatPhone(initial?.phone)} error={errors.phone} />
        <Field label="Email" name="email" type="email" defaultValue={initial?.email ?? ""} error={errors.email} />
      </div>
      <fieldset className="space-y-2 rounded-md border border-ngoc-200 bg-ngoc-50/60 px-4 py-3">
        <legend className="px-1 text-sm font-medium text-reu">Trên trang công khai (ai cũng xem được)</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showPhone} onChange={(e) => setShowPhone(e.target.checked)} /> Hiện số điện thoại (kèm nút Gọi, Zalo)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showEmail} onChange={(e) => setShowEmail(e.target.checked)} /> Hiện email
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            Người này <strong>đã đồng ý</strong> công khai số điện thoại/email
            <span className="block text-sm text-reu">Chưa đồng ý thì trang công khai chỉ hiện tên và vai trò.</span>
          </span>
        </label>
        {errors.consent && <p className="text-sm text-loi">{errors.consent}</p>}
        {consent && <Field label="Đồng ý bằng cách nào (không bắt buộc)" name="consentNote" defaultValue={initial?.consentNote ?? ""} placeholder="Ví dụ: đồng ý qua điện thoại ngày 2/11" />}
      </fieldset>
      <div className="flex gap-3">
        <button type="submit" className="btn-chinh" disabled={save.isPending}>
          {save.isPending ? "Đang lưu…" : initial ? "Lưu" : "Thêm người liên hệ"}
        </button>
        <button type="button" className="btn-phu" onClick={done}>
          Huỷ
        </button>
      </div>
    </form>
  );
}
