"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { MediaItem } from "@/lib/types";

const INTERVAL_MS = 5500;
const SLIDE_MS = 700;
const SWIPE_PX = 40;

interface Props {
  slides: MediaItem[];
  /** Nội dung phủ lên ảnh (tên dòng họ, khẩu hiệu) */
  children?: ReactNode;
}

/**
 * Banner nhiều ảnh tự trượt và quay vòng (ảnh cuối → ảnh đầu vẫn trượt tiếp, không giật ngược).
 * Cách làm: thêm bản sao ảnh đầu vào cuối dải; trượt tới bản sao xong thì nhảy không hiệu ứng về ảnh đầu.
 * Dừng khi rê chuột, khi đang dùng bàn phím trong banner, khi tab bị ẩn; không tự trượt nếu người dùng
 * bật "giảm chuyển động" trong hệ điều hành. Vuốt trái/phải trên điện thoại.
 */
export function BannerCarousel({ slides, children }: Props) {
  const count = slides.length;
  const [pos, setPos] = useState(0); // 0..count (count = bản sao ảnh đầu)
  const [animate, setAnimate] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const drag = useRef<{ x: number; id: number } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const go = useCallback(
    (target: number) => {
      if (count < 2 || busy.current) return;
      if (target < 0) {
        // Lùi từ ảnh đầu: nhảy tới bản sao ở cuối (trông y hệt ảnh đầu) rồi trượt về ảnh cuối
        setAnimate(false);
        setPos(count);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            setAnimate(true);
            setPos(count - 1);
          }),
        );
        return;
      }
      if (!reduced) {
        busy.current = true;
        window.setTimeout(() => (busy.current = false), SLIDE_MS);
      }
      setAnimate(!reduced);
      setPos(reduced && target === count ? 0 : target);
    },
    [count, reduced],
  );

  // Trượt tới bản sao ảnh đầu xong → nhảy (không hiệu ứng) về ảnh đầu thật.
  // Dùng hẹn giờ thay cho sự kiện transitionend vì sự kiện đó không chạy khi tab đang ẩn.
  useEffect(() => {
    if (count < 2 || pos !== count) return;
    const t = window.setTimeout(() => {
      setAnimate(false);
      setPos(0);
    }, SLIDE_MS + 20);
    return () => window.clearTimeout(t);
  }, [pos, count]);

  // Tự trượt
  useEffect(() => {
    if (count < 2 || paused || reduced) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") go(pos + 1);
    }, INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [count, paused, reduced, pos, go]);

  if (count === 0) return null;
  const active = pos % count;
  const track = count > 1 ? [...slides, slides[0]!] : slides;

  const onPointerDown = (e: PointerEvent) => {
    drag.current = { x: e.clientX, id: e.pointerId };
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) >= SWIPE_PX) go(dx < 0 ? pos + 1 : pos - 1);
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Ảnh dòng họ"
      className="group relative h-full w-full touch-pan-y select-none overflow-hidden bg-then"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
    >
      <div
        className="flex h-full"
        style={{
          transform: `translateX(-${pos * 100}%)`,
          transition: animate ? `transform ${SLIDE_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)` : "none",
        }}
        aria-live={paused ? "polite" : "off"}
      >
        {track.map((s, i) => (
          <div
            key={`${s.id}-${i}`}
            className="relative h-full w-full shrink-0"
            role="group"
            aria-roledescription="slide"
            aria-label={`Ảnh ${(i % count) + 1} trên ${count}${s.caption ? `: ${s.caption}` : ""}`}
            aria-hidden={i % count !== active || i === count}
          >
            <img
              src={s.urls.lg}
              srcSet={`${s.urls.md} 960w, ${s.urls.lg} 1920w`}
              sizes="100vw"
              alt={s.caption ?? ""}
              loading={i === 0 ? "eager" : "lazy"}
              draggable={false}
              className="h-full w-full object-cover"
            />
            {s.caption && (
              <span className="absolute right-3 top-3 max-w-[60%] truncate rounded bg-then/60 px-2 py-1 text-sm text-ngoc-50">{s.caption}</span>
            )}
          </div>
        ))}
      </div>

      {children}

      {count > 1 && (
        <>
          {/* Nút trước/sau chỉ hiện trên máy tính; điện thoại vuốt hoặc bấm chấm */}
          <button
            type="button"
            aria-label="Ảnh trước"
            onClick={() => go(pos - 1)}
            className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 rounded-full bg-then/45 text-2xl text-white opacity-0 transition-opacity hover:bg-then/70 focus-visible:opacity-100 group-hover:opacity-100 md:block"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Ảnh sau"
            onClick={() => go(pos + 1)}
            className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 rounded-full bg-then/45 text-2xl text-white opacity-0 transition-opacity hover:bg-then/70 focus-visible:opacity-100 group-hover:opacity-100 md:block"
          >
            ›
          </button>
          <div className="absolute bottom-3 right-4 flex gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Xem ảnh ${i + 1}`}
                aria-current={i === active ? "true" : undefined}
                onClick={() => go(i)}
                className="flex h-6 w-6 items-center justify-center"
              >
                <span className={`block h-2 rounded-full transition-all ${i === active ? "w-6 bg-thep-nhat" : "w-2 bg-white/60"}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
