"use client";

import { useId, useState, type FormEvent } from "react";
import { fieldErrors } from "@/lib/api";
import { fromDateFields, toDateFields, type DateFields } from "@/lib/format";
import type { FactType, Gender, OtherNameType, PersonInput, Privacy } from "@/lib/types";
import { FormError } from "./field";

export interface PersonFormValues {
  fullName: string;
  gender: Gender;
  isLiving: boolean;
  birthDate: PersonInput["birthDate"];
  deathDate: PersonInput["deathDate"];
  privacy?: Privacy | undefined;
  otherNames?: Array<{ type: string; value: string }>;
  facts?: Partial<Record<FactType, string>>;
  biography?: { text: string } | null;
}

/** Tên khác theo lệ gia phả; "khac" dùng cho tên thường gọi trong nhà, trong làng */
const OTHER_NAME_FIELDS: Array<{ type: OtherNameType; label: string; placeholder?: string }> = [
  { type: "khac", label: "Tên thường gọi", placeholder: "Ví dụ: ông Tư" },
  { type: "huy", label: "Tên huý" },
  { type: "tu", label: "Tên tự" },
  { type: "hieu", label: "Tên hiệu" },
  { type: "thuy", label: "Tên thuỵ" },
];

const emptyNames = (): Record<OtherNameType, string> => ({ khac: "", huy: "", tu: "", hieu: "", thuy: "" });

function namesFrom(list: PersonFormValues["otherNames"]): Record<OtherNameType, string> {
  const out = emptyNames();
  for (const n of list ?? []) {
    const t = n.type as OtherNameType;
    if (t in out) out[t] = out[t] ? `${out[t]}; ${n.value}` : n.value;
  }
  return out;
}

interface Props {
  initial?: Partial<PersonFormValues>;
  submitLabel: string;
  onSubmit: (values: PersonInput) => Promise<unknown>;
  onCancel: () => void;
}

const PRIVACY_OPTIONS: Array<{ value: Privacy; label: string }> = [
  { value: "public", label: "Mọi người (cả website công khai)" },
  { value: "members", label: "Chỉ thành viên dòng họ" },
  { value: "hidden", label: "Ẩn — chỉ ban quản lý" },
];

export function PersonForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const uid = useId();
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [gender, setGender] = useState<Gender>(initial?.gender ?? "male");
  const [isLiving, setIsLiving] = useState(initial?.isLiving ?? true);
  const [birth, setBirth] = useState<DateFields>(toDateFields(initial?.birthDate));
  const [death, setDeath] = useState<DateFields>(toDateFields(initial?.deathDate));
  const [privacy, setPrivacy] = useState<Privacy | "">(initial?.privacy ?? "");
  const [names, setNames] = useState(namesFrom(initial?.otherNames));
  const [facts, setFacts] = useState<Record<FactType, string>>({
    birthPlace: initial?.facts?.birthPlace ?? "",
    occupation: initial?.facts?.occupation ?? "",
    burialPlace: initial?.facts?.burialPlace ?? "",
  });
  const [bio, setBio] = useState(initial?.biography?.text ?? "");
  const hasMore = Object.values(names).some(Boolean) || Object.values(facts).some(Boolean) || Boolean(bio);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.fullName = "Cần nhập họ tên";
    const birthDate = fromDateFields(birth);
    if (typeof birthDate === "string") next.birthDate = birthDate;
    const deathDate = isLiving ? null : fromDateFields(death);
    if (typeof deathDate === "string") next.deathDate = deathDate;
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    try {
      await onSubmit({
        fullName: fullName.trim(),
        gender,
        isLiving,
        birthDate: birthDate as PersonInput["birthDate"],
        deathDate: deathDate as PersonInput["deathDate"],
        ...(privacy ? { privacy } : {}),
        otherNames: OTHER_NAME_FIELDS.filter((f) => names[f.type].trim()).map((f) => ({ type: f.type, value: names[f.type].trim() })),
        facts: {
          birthPlace: facts.birthPlace.trim() || null,
          occupation: facts.occupation.trim() || null,
          // người còn sống không có nơi an táng
          burialPlace: (!isLiving && facts.burialPlace.trim()) || null,
        },
        biography: bio.trim() ? { text: bio.trim() } : null,
      });
    } catch (err) {
      // Lỗi từ máy chủ có thể mang tiền tố "person." (khi thêm người thân)
      const fe = Object.fromEntries(Object.entries(fieldErrors(err)).map(([k, v]) => [k.replace(/^person\./, "").split(".")[0]!, v]));
      setErrors(fe);
      if (Object.keys(fe).length === 0) setFormError(err instanceof Error ? err.message : "Không lưu được.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <FormError message={formError} />
      <div>
        <label htmlFor={`${uid}-ten`} className="nhan">
          Họ và tên
        </label>
        <input
          id={`${uid}-ten`}
          className="o-nhap font-serif text-lg"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoFocus
          aria-invalid={Boolean(errors.fullName)}
        />
        {errors.fullName && <p className="mt-1 text-sm text-loi">{errors.fullName}</p>}
      </div>

      <fieldset>
        <legend className="nhan">Giới tính</legend>
        <div className="flex gap-2">
          {(["male", "female", "unknown"] as const).map((g) => (
            <label key={g} className={chipClass(gender === g)}>
              <input type="radio" name={`${uid}-gt`} className="sr-only" checked={gender === g} onChange={() => setGender(g)} />
              {g === "male" ? "Nam" : g === "female" ? "Nữ" : "Chưa rõ"}
            </label>
          ))}
        </div>
      </fieldset>

      <DateGroup label="Ngày sinh" value={birth} onChange={setBirth} error={errors.birthDate} />

      <fieldset>
        <legend className="nhan">Tình trạng</legend>
        <div className="flex gap-2">
          <label className={chipClass(isLiving)}>
            <input type="radio" name={`${uid}-song`} className="sr-only" checked={isLiving} onChange={() => setIsLiving(true)} />
            Còn sống
          </label>
          <label className={chipClass(!isLiving)}>
            <input type="radio" name={`${uid}-song`} className="sr-only" checked={!isLiving} onChange={() => setIsLiving(false)} />
            Đã mất
          </label>
        </div>
      </fieldset>

      {!isLiving && (
        <DateGroup
          label="Ngày mất"
          value={death}
          onChange={setDeath}
          error={errors.deathDate}
          hint="Nhập đủ ngày và tháng để hệ thống tự tính ngày giỗ âm lịch."
        />
      )}

      <details className="group rounded-md border border-ngoc-200 bg-ngoc-50/60 px-4 py-3" open={hasMore || undefined}>
        <summary className="cursor-pointer font-medium text-son">Thông tin thêm: tên huý, quê quán, tiểu sử…</summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {OTHER_NAME_FIELDS.map((f) => (
              <TextField
                key={f.type}
                label={f.label}
                value={names[f.type]}
                placeholder={f.placeholder}
                maxLength={200}
                onChange={(v) => setNames((n) => ({ ...n, [f.type]: v }))}
              />
            ))}
          </div>
          <TextField label="Quê quán, nơi sinh" value={facts.birthPlace} onChange={(v) => setFacts((x) => ({ ...x, birthPlace: v }))} />
          <TextField
            label="Nghề nghiệp, chức tước, học vị"
            value={facts.occupation}
            placeholder="Ví dụ: Lý trưởng, Cử nhân, Giáo viên"
            onChange={(v) => setFacts((x) => ({ ...x, occupation: v }))}
          />
          {!isLiving && (
            <TextField
              label="Nơi an táng (mộ phần)"
              value={facts.burialPlace}
              placeholder="Ví dụ: Nghĩa trang họ, xứ Đồng Cát"
              onChange={(v) => setFacts((x) => ({ ...x, burialPlace: v }))}
            />
          )}
          {errors.facts && <p className="text-sm text-loi">{errors.facts}</p>}
          <div>
            <label htmlFor={`${uid}-tieusu`} className="nhan">
              Tiểu sử
            </label>
            <textarea
              id={`${uid}-tieusu`}
              className="o-nhap min-h-32 leading-relaxed"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Công đức, sự nghiệp, kỷ niệm con cháu còn nhớ…"
              maxLength={20000}
            />
            {errors.biography && <p className="mt-1 text-sm text-loi">{errors.biography}</p>}
          </div>
        </div>
      </details>

      <div>
        <label htmlFor={`${uid}-rieng`} className="nhan">
          Ai được xem thông tin
        </label>
        <select id={`${uid}-rieng`} className="o-nhap" value={privacy} onChange={(e) => setPrivacy(e.target.value as Privacy | "")}>
          <option value="">Theo mặc định</option>
          {PRIVACY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {!privacy && <p className="mt-1 text-sm text-reu">Người đã mất: mọi người xem được. Người còn sống: chỉ thành viên dòng họ.</p>}
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" className="btn-chinh flex-1" disabled={pending}>
          {pending ? "Đang lưu…" : submitLabel}
        </button>
        <button type="button" className="btn-phu" onClick={onCancel}>
          Huỷ
        </button>
      </div>
    </form>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength = 300,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string | undefined;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="nhan">
        {label}
      </label>
      <input id={id} className="o-nhap" value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function chipClass(active: boolean) {
  return `cursor-pointer rounded-md border px-4 py-2 text-[0.95rem] min-h-11 inline-flex items-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-thep ${
    active ? "border-son bg-son-nhat font-medium text-son-dam" : "border-ngoc-300 bg-giay text-then hover:bg-ngoc-100"
  }`;
}

function DateGroup({
  label,
  value,
  onChange,
  error,
  hint,
}: {
  label: string;
  value: DateFields;
  onChange: (v: DateFields) => void;
  error?: string | undefined;
  hint?: string;
}) {
  const uid = useId();
  const set = (patch: Partial<DateFields>) => onChange({ ...value, ...patch });
  const num = "o-nhap text-center tabular-nums";
  return (
    <fieldset aria-describedby={error ? `${uid}-loi` : hint ? `${uid}-goiy` : undefined}>
      <legend className="nhan">{label}</legend>
      <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-2">
        <input aria-label={`${label} — ngày`} inputMode="numeric" placeholder="Ngày" className={num} value={value.day} onChange={(e) => set({ day: e.target.value })} disabled={value.approx} />
        <input aria-label={`${label} — tháng`} inputMode="numeric" placeholder="Tháng" className={num} value={value.month} onChange={(e) => set({ month: e.target.value })} disabled={value.approx} />
        <input aria-label={`${label} — năm`} inputMode="numeric" placeholder="Năm" className={num} value={value.year} onChange={(e) => set({ year: e.target.value })} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-reu">
        <label className="inline-flex items-center gap-2">
          <select
            aria-label={`${label} — loại lịch`}
            className="rounded border border-ngoc-300 bg-giay px-2 py-1"
            value={value.calendar}
            onChange={(e) => set({ calendar: e.target.value as DateFields["calendar"] })}
          >
            <option value="solar">Dương lịch</option>
            <option value="lunar">Âm lịch</option>
          </select>
        </label>
        {value.calendar === "lunar" && (
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={value.isLeapMonth} onChange={(e) => set({ isLeapMonth: e.target.checked })} />
            Tháng nhuận
          </label>
        )}
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={value.approx} onChange={(e) => set({ approx: e.target.checked, day: "", month: "" })} />
          Chỉ biết khoảng năm
        </label>
      </div>
      {error ? (
        <p id={`${uid}-loi`} className="mt-1 text-sm text-loi">
          {error}
        </p>
      ) : hint ? (
        <p id={`${uid}-goiy`} className="mt-1 text-sm text-reu">
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}

