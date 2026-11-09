"use client";

import { useRef, useState, type FormEvent } from "react";
import { fieldErrors } from "@/lib/api";
import { useMusicSaved, useRemoveMusic, useRenameMusic, useSiteMusic } from "@/lib/queries";
import { MAX_MUSIC_MB, uploadMusic } from "@/lib/upload";
import { FormError } from "./field";

const sizeText = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("vi-VN")} KB`
    : `${(bytes / 1024 / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB`;

/** Cài đặt nhạc nền: một bản nhạc cho cả trang thành viên và trang công khai, người xem tự bật (mặc định tắt) */
export function MusicSettings({ clanId }: { clanId: string }) {
  const music = useSiteMusic(clanId);
  const saved = useMusicSaved(clanId);
  const rename = useRenameMusic(clanId);
  const remove = useRemoveMusic(clanId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  async function upload(e: FormEvent) {
    e.preventDefault();
    const file = fileInput.current?.files?.[0];
    setError(null);
    setStatus("");
    if (!file) {
      setError("Chưa chọn file nhạc.");
      return;
    }
    setUploading(true);
    try {
      saved(await uploadMusic(clanId, file, title));
      setTitle("");
      if (fileInput.current) fileInput.current.value = "";
      setStatus("Đã thay nhạc nền");
    } catch (err) {
      setError(fieldErrors(err).file ?? (err instanceof Error ? err.message : "Không tải được nhạc."));
    } finally {
      setUploading(false);
    }
  }

  async function saveTitle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = String(new FormData(e.currentTarget).get("title") ?? "").trim();
    setError(null);
    try {
      await rename.mutateAsync(next);
      setEditing(false);
      setStatus("Đã đổi tên bản nhạc");
    } catch (err) {
      setError(fieldErrors(err).title ?? (err instanceof Error ? err.message : "Không đổi được tên."));
    }
  }

  const current = music.data?.music;
  return (
    <div className="space-y-6">
      <FormError message={error ?? music.error?.message} />
      {current ? (
        <div className="rounded-lg border border-ngoc-200 bg-giay p-4">
          {editing ? (
            <form onSubmit={saveTitle} className="flex flex-wrap items-end gap-3">
              <label className="min-w-0 flex-1">
                <span className="nhan">Tên bản nhạc</span>
                <input name="title" className="o-nhap" defaultValue={current.title} maxLength={120} autoFocus />
              </label>
              <button type="submit" className="btn-chinh" disabled={rename.isPending}>
                Lưu tên
              </button>
              <button type="button" className="btn-phu" onClick={() => setEditing(false)}>
                Huỷ
              </button>
            </form>
          ) : (
            <p className="font-serif text-lg">{current.title}</p>
          )}
          <p className="mt-1 text-sm text-reu">
            {sizeText(current.sizeBytes)} · thay lúc {new Date(current.updatedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}
          </p>
          <audio controls preload="none" src={current.url} className="mt-3 w-full">
            Trình duyệt không phát được nhạc.
          </audio>
          {!editing && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" className="btn-phu" onClick={() => setEditing(true)}>
                Đổi tên
              </button>
              {confirming ? (
                <>
                  <button
                    type="button"
                    className="btn bg-loi text-white hover:bg-son-dam"
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(undefined, {
                        onSuccess: () => setStatus("Đã gỡ nhạc nền"),
                        onError: (err) => setError(err.message),
                        onSettled: () => setConfirming(false),
                      })
                    }
                  >
                    Gỡ nhạc nền
                  </button>
                  <button type="button" className="btn-phu" onClick={() => setConfirming(false)}>
                    Huỷ
                  </button>
                </>
              ) : (
                <button type="button" className="btn-nguy" onClick={() => setConfirming(true)}>
                  Gỡ
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        music.data && <p className="text-reu">Chưa có nhạc nền — nút Nhạc nền chưa hiện trên thanh đầu trang.</p>
      )}

      <form onSubmit={upload} className="space-y-4" noValidate>
        <label className="block">
          <span className="nhan">{current ? "Thay bằng bản nhạc khác" : "Chọn bản nhạc"}</span>
          <input
            ref={fileInput}
            type="file"
            accept="audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,.mp3,.m4a,.ogg,.wav"
            className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-ngoc-100 file:px-4 file:font-medium hover:file:bg-ngoc-200"
          />
          <span className="mt-1 block text-sm text-reu">MP3, M4A, OGG hoặc WAV, tối đa {MAX_MUSIC_MB} MB. Nhạc phát lặp lại, âm lượng nhỏ.</span>
        </label>
        <label className="block">
          <span className="nhan">Tên bản nhạc (không bắt buộc)</span>
          <input className="o-nhap" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Để trống thì lấy theo tên file" />
        </label>
        <p className="max-w-prose text-sm text-reu">
          Chỉ dùng bản nhạc dòng họ được phép phát công khai (tự thu, nhạc dân gian không lời, hoặc đã xin phép người giữ bản quyền). Trang công khai ai cũng
          nghe được.
        </p>
        <div className="flex items-center gap-4">
          <button type="submit" className="btn-chinh" disabled={uploading}>
            {uploading ? "Đang tải lên…" : current ? "Thay nhạc" : "Tải nhạc lên"}
          </button>
          <span role="status" className="text-sm text-reu">
            {status}
          </span>
        </div>
      </form>
    </div>
  );
}
