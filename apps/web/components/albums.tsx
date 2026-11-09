"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Lightbox, type LightboxItem } from "@/components/lightbox";
import { checkImageFile, uploadImage } from "@/lib/upload";
import type { Album, AlbumVisibility, Photo } from "@/lib/types";

const n = (v: number) => v.toLocaleString("vi-VN");

/** Lưới album: ảnh bìa trong khung giấy, tên album, số ảnh; album chỉ thành viên có nhãn riêng */
export function AlbumGrid({
  albums,
  hrefOf,
  extra,
  showVisibility = false,
}: {
  albums: Album[];
  hrefOf: (a: Album) => string;
  /** Ô thêm ở cuối (vd. "Ảnh lẻ") */
  extra?: React.ReactNode;
  showVisibility?: boolean;
}) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
      {albums.map((a) => (
        <li key={a.id}>
          <AlbumCard
            href={hrefOf(a)}
            title={a.title}
            cover={a.cover}
            meta={[a.count ? `${n(a.count)} ảnh` : "Chưa có ảnh", showVisibility && a.visibility === "members" ? "Chỉ thành viên" : null]}
          />
        </li>
      ))}
      {extra}
    </ul>
  );
}

export function AlbumCard({ href, title, cover, meta }: { href: string; title: string; cover: Photo | null; meta: Array<string | null> }) {
  return (
    <Link href={href} className="group block rounded-[3px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-son">
      <div className="aspect-[4/3] overflow-hidden rounded-[3px] bg-do shadow-[0_1px_0_rgb(90_67_48/0.18)] ring-1 ring-[#d6c9ae]">
        {cover ? (
          <img
            src={cover.urls.md}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-thep/60" aria-hidden>
            <svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="6" y="10" width="36" height="28" rx="2" />
              <circle cx="17" cy="20" r="3.5" />
              <path d="m8 35 11-10 8 7 5-4 10 8" />
            </svg>
          </div>
        )}
      </div>
      <h3 className="mt-2 font-serif text-lg leading-snug text-then group-hover:underline group-hover:underline-offset-4">{title}</h3>
      <p className="text-sm text-reu">{meta.filter(Boolean).join(" · ")}</p>
    </Link>
  );
}

/**
 * Lưới ảnh vuông. Bấm để xem lớn (vuốt / mũi tên để chuyển).
 * `selectable`: chế độ chọn nhiều ảnh để chuyển album, đặt bìa, xoá.
 */
export function PhotoGrid({
  photos,
  selectable = false,
  selected,
  onToggle,
  coverId,
  allowDownload = false,
}: {
  photos: Photo[];
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  coverId?: string | null;
  allowDownload?: boolean;
}) {
  const [viewing, setViewing] = useState<number | null>(null);
  const items: LightboxItem[] = photos.map((p, i) => ({
    src: p.urls.lg,
    ...(p.urls.orig && { zoomSrc: p.urls.orig }),
    alt: p.caption ?? `Ảnh ${i + 1}`,
    caption: p.caption,
    ...(allowDownload && p.urls.orig && { downloadUrl: p.urls.orig }),
  }));
  return (
    <>
      <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:gap-1.5 lg:grid-cols-6">
        {photos.map((p, i) => {
          const on = selected?.has(p.id) ?? false;
          return (
            <li key={p.id} className="relative">
              <button
                type="button"
                onClick={() => (selectable ? onToggle?.(p.id) : setViewing(i))}
                aria-pressed={selectable ? on : undefined}
                aria-label={`${selectable ? (on ? "Bỏ chọn" : "Chọn") : "Xem"} ${p.caption ?? `ảnh ${i + 1}`}`}
                className={`block aspect-square w-full overflow-hidden bg-do focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-son ${
                  on ? "ring-[3px] ring-son ring-offset-1" : ""
                }`}
              >
                <img src={p.urls.sm} alt="" loading="lazy" className={`h-full w-full object-cover ${on ? "opacity-80" : ""}`} />
              </button>
              {selectable && (
                <span
                  aria-hidden
                  className={`pointer-events-none absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 text-sm font-bold ${
                    on ? "border-white bg-son text-white" : "border-white/90 bg-then/30"
                  }`}
                >
                  {on ? "✓" : ""}
                </span>
              )}
              {coverId === p.id && (
                <span className="pointer-events-none absolute bottom-1 left-1 rounded-sm bg-then/80 px-1.5 py-0.5 text-[0.7rem] text-thep-nhat">Ảnh bìa</span>
              )}
            </li>
          );
        })}
      </ul>
      <Lightbox items={items} index={viewing} onIndexChange={setViewing} onClose={() => setViewing(null)} />
    </>
  );
}

/** Tải nhiều ảnh: 3 ảnh cùng lúc, báo tiến độ, ảnh lỗi liệt kê riêng (ảnh khác vẫn tải tiếp) */
export function useUploadQueue(clanId: string, albumId: string | undefined, onDone: () => void) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const busy = useRef(false);

  async function start(files: File[]) {
    if (busy.current || files.length === 0) return;
    busy.current = true;
    const errors: string[] = [];
    // lỗi biết trước (HEIC, quá lớn, không phải ảnh) báo ngay, không tốn mạng
    const ok = files.filter((f) => {
      const problem = checkImageFile(f);
      if (problem) errors.push(problem);
      return !problem;
    });
    let done = 0;
    setProgress({ done, total: ok.length });
    const queue = [...ok];
    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        try {
          await uploadImage(clanId, f, undefined, albumId);
        } catch (err) {
          errors.push(`${f.name}: ${err instanceof Error ? err.message : "không tải được"}`);
        }
        setProgress({ done: ++done, total: ok.length });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setFailures(errors);
    setProgress(null);
    busy.current = false;
    onDone();
  }

  return { start, progress, failures, clearFailures: () => setFailures([]) };
}

/** Nút "Thêm ảnh" (chọn nhiều ảnh) + tiến độ + danh sách ảnh lỗi */
export function UploadButton({ queue, label = "Thêm ảnh" }: { queue: ReturnType<typeof useUploadQueue>; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const { progress, failures } = queue;
  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        aria-label={label}
        tabIndex={-1}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          queue.clearFailures();
          void queue.start(files);
        }}
      />
      <button type="button" className="btn-chinh" disabled={Boolean(progress)} onClick={() => input.current?.click()}>
        {progress ? `Đang tải ${n(progress.done)}/${n(progress.total)} ảnh…` : label}
      </button>
      {progress && (
        <div className="mt-2 h-1.5 w-56 max-w-full overflow-hidden rounded-full bg-ngoc-100" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label="Tiến độ tải ảnh">
          <div className="h-full bg-thep transition-[width]" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
        </div>
      )}
      {failures.length > 0 && (
        <div role="alert" className="mt-3 rounded-md border border-loi/30 bg-son-nhat px-3 py-2 text-sm text-loi">
          <p className="font-medium">{failures.length} ảnh chưa tải được:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {failures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Ai xem được album: chỉ con cháu đăng nhập, hay cả khách trên trang công khai */
export function VisibilityChoice({ value, onChange }: { value: AlbumVisibility; onChange: (v: AlbumVisibility) => void }) {
  const options: Array<{ v: AlbumVisibility; label: string; hint: string }> = [
    { v: "members", label: "Chỉ thành viên", hint: "Con cháu đã đăng nhập mới xem được." },
    { v: "public", label: "Công khai", hint: "Hiện cả trên trang công khai, ai có link cũng xem được. Nên tránh ảnh riêng tư của người còn sống." },
  ];
  return (
    <fieldset>
      <legend className="nhan">Ai được xem</legend>
      <div className="space-y-2">
        {options.map((o) => (
          <label key={o.v} className="flex cursor-pointer gap-3 rounded-md border border-ngoc-200 bg-giay px-3 py-2 has-[:checked]:border-thep has-[:checked]:bg-thep-nhat/40">
            <input type="radio" name="visibility" value={o.v} checked={value === o.v} onChange={() => onChange(o.v)} className="mt-1 accent-son" />
            <span>
              <span className="font-medium">{o.label}</span>
              <span className="block text-sm text-reu">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
