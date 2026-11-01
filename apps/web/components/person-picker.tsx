"use client";

import { useId, useState } from "react";
import { usePersonSearch } from "@/lib/queries";
import type { PersonListItem } from "@/lib/types";

/** Ô tìm người theo tên (gõ không dấu được), chọn từ danh sách gợi ý. */
export function PersonPicker({
  clanId,
  label,
  value,
  onChange,
}: {
  clanId: string;
  label: string;
  value: PersonListItem | null;
  onChange: (p: PersonListItem | null) => void;
}) {
  const uid = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const search = usePersonSearch(clanId, q.trim());
  const items = (search.data?.items ?? []).slice(0, 8);

  if (value) {
    return (
      <div>
        <span className="nhan">{label}</span>
        <div className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-thep bg-thep-nhat px-3 py-2">
          <span className="font-serif text-lg">{value.fullName}</span>
          <button type="button" className="text-sm text-son hover:underline" onClick={() => onChange(null)}>
            Đổi người
          </button>
        </div>
      </div>
    );
  }

  const choose = (p: PersonListItem) => {
    onChange(p);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <label htmlFor={uid} className="nhan">
        {label}
      </label>
      <input
        id={uid}
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={`${uid}-ds`}
        aria-activedescendant={open && items[active] ? `${uid}-${items[active].id}` : undefined}
        className="o-nhap"
        placeholder="Gõ tên, ví dụ: minh"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, items.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && items[active]) {
            e.preventDefault();
            choose(items[active]);
          } else return;
          e.preventDefault();
        }}
      />
      {open && items.length > 0 && (
        <ul id={`${uid}-ds`} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-ngoc-300 bg-giay py-1 shadow-lg">
          {items.map((p, i) => (
            <li
              key={p.id}
              id={`${uid}-${p.id}`}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3 py-2 ${i === active ? "bg-ngoc-100" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
            >
              <span className="font-serif">{p.fullName}</span>
              <span className="ml-2 text-sm text-reu">
                {p.generation ? `đời ${p.generation}` : ""}
                {p.birthYear ? `, sinh ${p.birthYear}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
