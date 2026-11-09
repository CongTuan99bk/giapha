"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { SiteMusic } from "@/lib/types";

/**
 * Nhạc nền: mặc định tắt, người xem tự bật. Bật rồi thì nhớ trên máy (localStorage) — lần sau vào trang,
 * trình duyệt chặn tự phát nên nhạc chờ lần chạm / bấm phím đầu tiên rồi mới phát.
 * Một đối tượng Audio cho cả trang: chuyển giữa các thẻ, sang trang công khai, nhạc không bị ngắt.
 */

const STORAGE_KEY = "coinguon:nhac";
const VOLUME = 0.35;

interface PlayerState {
  /** Người xem đã bật nhạc */
  on: boolean;
  /** Đã bật nhưng trình duyệt chưa cho phát — chờ lần chạm đầu tiên */
  waiting: boolean;
}

let state: PlayerState = { on: false, waiting: false };
const OFF: PlayerState = { on: false, waiting: false };
let audio: HTMLAudioElement | null = null;
/** Bài đang nạp, theo thời điểm thay bài — cùng bài thì giữ nguyên dù đường dẫn công khai / thành viên khác nhau */
let track: { version: string; src: string } | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let resumeChecked = false;
let disarmGesture: (() => void) | null = null;
const listeners = new Set<() => void>();

function setState(next: Partial<PlayerState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function remembered() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function remember(on: boolean) {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // trình duyệt chặn lưu (chế độ ẩn danh…): chỉ không nhớ được cho lần sau
  }
}

/** Tăng / giảm âm lượng từ từ (iPhone không cho chỉnh âm lượng bằng mã — khi đó phát luôn ở mức máy) */
function fadeTo(target: number, done?: () => void) {
  if (fadeTimer) clearInterval(fadeTimer);
  const a = audio;
  if (!a) return;
  fadeTimer = setInterval(() => {
    const step = 0.035;
    const v = a.volume;
    if (Math.abs(v - target) <= step) {
      a.volume = target;
      if (fadeTimer) clearInterval(fadeTimer);
      fadeTimer = null;
      done?.();
      return;
    }
    a.volume = v < target ? v + step : v - step;
  }, 50);
}

function load(music: SiteMusic) {
  if (!audio) {
    audio = new Audio();
    audio.loop = true;
    audio.preload = "none";
  }
  if (track?.version !== music.updatedAt) {
    audio.src = music.url;
    track = { version: music.updatedAt, src: music.url };
  }
  return audio;
}

async function play(music: SiteMusic) {
  const a = load(music);
  disarmGesture?.();
  a.volume = 0;
  try {
    await a.play();
    setState({ on: true, waiting: false });
    fadeTo(VOLUME);
  } catch {
    // chưa có thao tác của người xem nên trình duyệt chặn: phát ở lần chạm / bấm phím đầu tiên
    setState({ on: true, waiting: true });
    armGesture(music);
  }
}

function armGesture(music: SiteMusic) {
  const onGesture = (e: Event) => {
    // chạm vào chính nút nhạc: để nút tự xử lý (không thì vừa phát đã bị tắt)
    if (e.target instanceof Element && e.target.closest("[data-nut-nhac]")) return;
    void play(music);
  };
  const opts = { capture: true } as const;
  document.addEventListener("pointerdown", onGesture, opts);
  document.addEventListener("keydown", onGesture, opts);
  disarmGesture = () => {
    document.removeEventListener("pointerdown", onGesture, opts);
    document.removeEventListener("keydown", onGesture, opts);
    disarmGesture = null;
  };
}

function stop() {
  disarmGesture?.();
  setState({ on: false, waiting: false });
  const a = audio;
  if (a && !a.paused) fadeTo(0, () => a.pause());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Nút bật / tắt nhạc nền trên thanh đầu trang. Không có nhạc thì không hiện. */
export function MusicButton({ music }: { music: SiteMusic | null | undefined }) {
  const s = useSyncExternalStore(
    subscribe,
    () => state,
    () => OFF,
  );

  useEffect(() => {
    if (music === undefined) return; // đang tải
    if (music === null) {
      // quản trị đã gỡ nhạc: dừng, nhưng vẫn nhớ lựa chọn bật cho bài sau
      disarmGesture?.();
      audio?.pause();
      setState({ waiting: false });
      return;
    }
    if (!resumeChecked) {
      resumeChecked = true;
      if (remembered()) void play(music);
      return;
    }
    // quản trị thay bài khi đang nghe: chuyển sang bài mới
    if (state.on && track && track.version !== music.updatedAt) void play(music);
  }, [music]);

  if (!music) return null;
  const playing = s.on && !s.waiting;

  return (
    <button
      type="button"
      data-nut-nhac
      aria-pressed={s.on}
      title={playing ? `Đang phát: ${music.title}` : s.waiting ? "Chạm vào trang để phát nhạc" : `Bật nhạc: ${music.title}`}
      onClick={() => {
        if (playing) {
          stop();
          remember(false);
        } else {
          remember(true);
          void play(music);
        }
      }}
      className={`flex min-h-9 items-center gap-1.5 rounded px-2 py-1 text-sm ${
        s.on ? "bg-thep/25 text-thep-nhat" : "text-ngoc-200 hover:text-white"
      } focus-visible:outline-2 focus-visible:outline-thep`}
    >
      <NoteIcon on={s.on} />
      <span className="sr-only sm:not-sr-only">Nhạc nền</span>
    </button>
  );
}

function NoteIcon({ on }: { on: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18V5l11-2v13" />
      <circle cx="6.5" cy="18" r="2.5" fill={on ? "currentColor" : "none"} />
      <circle cx="17.5" cy="16" r="2.5" fill={on ? "currentColor" : "none"} />
      {!on && <path d="M3 3l18 18" />}
    </svg>
  );
}
