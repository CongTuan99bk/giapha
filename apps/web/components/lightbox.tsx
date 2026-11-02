"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

export interface LightboxItem {
  /** Ảnh cỡ lớn để xem (lg, 1920) */
  src: string;
  /** Ảnh nét nhất khi phóng to (bản gốc) */
  zoomSrc?: string;
  alt: string;
  caption?: string | null;
  /** Link tải ảnh gốc */
  downloadUrl?: string;
}

interface Props {
  items: LightboxItem[];
  /** Ảnh đang mở; null = đóng */
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}

/** Vòng chỉ số: -1 → cuối, n → 0 */
export const wrapIndex = (i: number, n: number) => ((i % n) + n) % n;

const SWIPE_PX = 50;

/**
 * Khung xem ảnh lớn (dùng thẻ <dialog> gốc của trình duyệt: tự giữ focus bên trong, Esc để đóng,
 * đóng xong trả focus về nút đã mở). Bấm ra ngoài ảnh để đóng; mũi tên trái/phải hoặc vuốt để chuyển;
 * bấm "Phóng to" (hoặc bấm đúp vào ảnh) để xem bản gốc kích thước thật và kéo/cuộn xem chi tiết.
 */
export function Lightbox({ items, index, onIndexChange, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [zoomed, setZoomed] = useState(false);
  // Ghi nhớ ảnh nào đã tải xong (theo đường dẫn) — tránh kẹt "Đang tải" khi ảnh đã có sẵn trong cache
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const open = index !== null && items.length > 0;
  const i = open ? wrapIndex(index, items.length) : 0;
  const item = items[i];
  const many = items.length > 1;

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = "hidden"; // khoá cuộn trang phía sau
    } else if (!open && d.open) {
      d.close();
    }
    if (!open) document.documentElement.style.overflow = "";
  }, [open]);

  useEffect(() => () => void (document.documentElement.style.overflow = ""), []);

  // Đổi ảnh thì về chế độ vừa màn hình
  useEffect(() => setZoomed(false), [i, open]);

  if (!item) return <dialog ref={dialog} className="hidden" onClose={onClose} />;

  const go = (d: number) => many && onIndexChange(wrapIndex(i + d, items.length));
  const shownSrc = zoomed && item.zoomSrc ? item.zoomSrc : item.src;
  const loaded = loadedSrc === shownSrc;

  const onPointerDown = (e: PointerEvent) => {
    if (!zoomed) swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1);
  };

  return (
    <dialog
      ref={dialog}
      aria-label={item.caption ?? item.alt}
      onClose={onClose}
      onCancel={(e) => {
        // Esc khi đang phóng to: thu nhỏ trước, Esc lần nữa mới đóng
        if (zoomed) {
          e.preventDefault();
          setZoomed(false);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        else if (e.key === "ArrowLeft") go(-1);
      }}
      // Nền tối nằm ngay trên <dialog> (không dùng ::backdrop vì một số trình duyệt không nhận biến màu ở đó)
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-then p-0 text-ngoc-50 backdrop:bg-transparent"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 px-3 py-2 text-sm md:px-5">
          <span className="min-w-0 flex-1 tabular-nums text-ngoc-300">{many ? `${i + 1}/${items.length}` : ""}</span>
          {item.zoomSrc && (
            <button type="button" className="rounded px-3 py-2 hover:bg-white/10" onClick={() => setZoomed((z) => !z)}>
              {zoomed ? "Vừa màn hình" : "Phóng to"}
            </button>
          )}
          {item.downloadUrl && (
            <a href={item.downloadUrl} className="rounded px-3 py-2 hover:bg-white/10">
              Tải ảnh gốc
            </a>
          )}
          <button type="button" autoFocus className="rounded px-3 py-2 text-base hover:bg-white/10" onClick={onClose} aria-label="Đóng xem ảnh">
            Đóng ✕
          </button>
        </div>

        <div
          className={`relative min-h-0 flex-1 ${zoomed ? "overflow-auto" : "flex items-center justify-center overflow-hidden"}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose(); // bấm ra vùng tối quanh ảnh
          }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          {!loaded && <span className="absolute inset-0 m-auto h-fit w-fit text-ngoc-300">Đang tải ảnh…</span>}
          <img
            key={shownSrc}
            ref={(el) => {
              if (el?.complete && el.naturalWidth > 0) setLoadedSrc(shownSrc);
            }}
            src={shownSrc}
            alt={item.alt}
            draggable={false}
            onLoad={() => setLoadedSrc(shownSrc)}
            onDoubleClick={() => item.zoomSrc && setZoomed((z) => !z)}
            className={
              zoomed
                ? "m-auto block max-w-none cursor-zoom-out"
                : `max-h-full max-w-full select-none object-contain px-2 pb-2 transition-opacity md:px-16 ${item.zoomSrc ? "cursor-zoom-in" : ""} ${loaded ? "opacity-100" : "opacity-0"}`
            }
          />
          {many && !zoomed && (
            <>
              <button
                type="button"
                aria-label="Ảnh trước"
                onClick={() => go(-1)}
                className="absolute left-2 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-black/40 text-3xl leading-none hover:bg-black/60 md:left-4"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Ảnh sau"
                onClick={() => go(1)}
                className="absolute right-2 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-black/40 text-3xl leading-none hover:bg-black/60 md:right-4"
              >
                ›
              </button>
            </>
          )}
        </div>
        {item.caption && !zoomed && <p className="px-4 pb-4 pt-1 text-center font-serif text-lg text-ngoc-100">{item.caption}</p>}
      </div>
    </dialog>
  );
}
