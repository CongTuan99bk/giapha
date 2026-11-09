"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { PhotoGrid, UploadButton, useUploadQueue, VisibilityChoice } from "@/components/albums";
import { Field, FormError } from "@/components/field";
import { fieldErrors } from "@/lib/api";
import {
  LOOSE_ALBUM,
  useAlbum,
  useAlbums,
  useClan,
  useDeleteAlbum,
  useDeletePhotos,
  useMovePhotos,
  useUpdateAlbum,
  useUpdateCaption,
} from "@/lib/queries";
import { ROLE_RANK } from "@/lib/roles";
import type { AlbumDetail, AlbumVisibility, Photo } from "@/lib/types";

/** Một album: lưới ảnh, xem lớn; biên tập viên thêm ảnh, chọn ảnh để chuyển / đặt bìa / sửa chú thích / xoá */
export default function AlbumPage() {
  const { clanId, albumId } = useParams<{ clanId: string; albumId: string }>();
  const clan = useClan(clanId);
  const detail = useAlbum(clanId, albumId);
  const canEdit = clan.data ? ROLE_RANK[clan.data.role] >= ROLE_RANK.editor : false;
  const loose = albumId === LOOSE_ALBUM;
  const queue = useUploadQueue(clanId, loose ? undefined : albumId, () => void detail.refetch());
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);

  const album = detail.data?.album ?? null;
  const photos = detail.data?.photos ?? [];
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-6">
        <Link href={`/dong-ho/${clanId}/anh`} className="text-sm text-son underline-offset-4 hover:underline">
          ← Thư viện ảnh
        </Link>
        {detail.error && (
          <div className="mt-4">
            <FormError message={detail.error.message} />
          </div>
        )}
        {detail.isPending && <p className="mt-6 text-reu">Đang tải…</p>}
        {detail.data && (
          <>
            <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 max-w-prose">
                <h1 className="font-serif text-3xl">{loose ? "Ảnh lẻ" : album?.title}</h1>
                <p className="mt-1 text-reu">
                  {photos.length.toLocaleString("vi-VN")} ảnh
                  {album && (album.visibility === "public" ? " · Công khai trên trang dòng họ" : " · Chỉ thành viên xem")}
                </p>
                {loose && <p className="mt-1 text-reu">Ảnh chưa xếp vào album nào: chân dung, banner trang chủ, ảnh tải lên lẻ. Chọn ảnh để chuyển vào album.</p>}
                {album?.description && <p className="mt-2 whitespace-pre-line">{album.description}</p>}
              </div>
              {canEdit && (
                <div className="flex flex-wrap items-start gap-2">
                  {!loose && <UploadButton queue={queue} />}
                  {photos.length > 0 && (
                    <button type="button" className="btn-phu" aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
                      {selecting ? "Xong" : "Chọn ảnh"}
                    </button>
                  )}
                  {album && !editing && (
                    <button type="button" className="btn-phu" onClick={() => setEditing(true)}>
                      Sửa album
                    </button>
                  )}
                </div>
              )}
            </header>

            {editing && album && <EditAlbum clanId={clanId} detail={detail.data} onClose={() => setEditing(false)} />}

            <div className="mt-6">
              {photos.length === 0 ? (
                <p className="rounded-md border border-dashed border-[#d6c9ae] px-5 py-10 text-center text-reu">
                  {canEdit ? "Album chưa có ảnh. Bấm “Thêm ảnh” để chọn nhiều ảnh một lúc." : "Album chưa có ảnh."}
                </p>
              ) : (
                <PhotoGrid photos={photos} selectable={selecting} selected={selected} onToggle={toggle} coverId={album?.coverId ?? null} allowDownload />
              )}
            </div>
          </>
        )}
      </div>
      {selecting && detail.data && (
        <SelectionBar clanId={clanId} detail={detail.data} albumId={albumId} selected={photos.filter((p) => selected.has(p.id))} onDone={stopSelecting} />
      )}
    </div>
  );
}

/** Thanh thao tác dưới đáy khi đang chọn ảnh */
function SelectionBar({ clanId, detail, albumId, selected, onDone }: { clanId: string; detail: AlbumDetail; albumId: string; selected: Photo[]; onDone: () => void }) {
  const albums = useAlbums(clanId);
  const move = useMovePhotos(clanId);
  const remove = useDeletePhotos(clanId);
  const caption = useUpdateCaption(clanId);
  const setCover = useUpdateAlbum(clanId, albumId);
  const [target, setTarget] = useState("");
  const [text, setText] = useState<string | null>(null);
  const ids = selected.map((p) => p.id);
  const one = selected.length === 1 ? selected[0]! : null;
  const error = move.error ?? remove.error ?? caption.error ?? setCover.error;
  const others = (albums.data?.albums ?? []).filter((a) => a.id !== albumId);

  return (
    <div role="region" aria-label="Thao tác với ảnh đã chọn" className="fixed inset-x-0 bottom-0 z-20 border-t border-thep/50 bg-the/95 shadow-[0_-4px_16px_rgb(36_26_23/0.12)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <p className="font-medium" aria-live="polite">
          {selected.length ? `Đã chọn ${selected.length} ảnh` : "Bấm vào ảnh để chọn"}
        </p>
        {selected.length > 0 && (
          <>
            <form
              className="flex items-center gap-2"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (!target) return;
                move.mutate({ mediaIds: ids, albumId: target === LOOSE_ALBUM ? null : target }, { onSuccess: onDone });
              }}
            >
              <label className="sr-only" htmlFor="chuyen-album">
                Chuyển sang album
              </label>
              <select id="chuyen-album" className="o-nhap w-auto py-1.5" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Chuyển sang album…</option>
                {others.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
                {detail.album && <option value={LOOSE_ALBUM}>Ảnh lẻ (bỏ khỏi album)</option>}
              </select>
              <button type="submit" className="btn-phu py-1.5" disabled={!target || move.isPending}>
                Chuyển
              </button>
            </form>
            {one && detail.album && (
              <button type="button" className="btn-phu py-1.5" disabled={setCover.isPending || detail.album.coverId === one.id} onClick={() => setCover.mutate({ coverId: one.id })}>
                {detail.album.coverId === one.id ? "Đang là ảnh bìa" : "Đặt làm ảnh bìa"}
              </button>
            )}
            {one && text === null && (
              <button type="button" className="btn-phu py-1.5" onClick={() => setText(one.caption ?? "")}>
                Sửa chú thích
              </button>
            )}
            <button
              type="button"
              className="btn-nguy py-1.5"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Xoá hẳn ${selected.length} ảnh? Ảnh đang làm chân dung hoặc banner cũng sẽ bị gỡ.`)) remove.mutate(ids, { onSuccess: onDone });
              }}
            >
              Xoá ảnh
            </button>
          </>
        )}
        <button type="button" className="ml-auto text-sm font-medium text-son underline-offset-4 hover:underline" onClick={onDone}>
          Bỏ chọn
        </button>
      </div>
      {one && text !== null && (
        <form
          className="mx-auto flex max-w-6xl gap-2 px-4 pb-3"
          onSubmit={(e) => {
            e.preventDefault();
            caption.mutate({ id: one.id, caption: text.trim() || null }, { onSuccess: () => setText(null) });
          }}
        >
          <label className="sr-only" htmlFor="chu-thich">
            Chú thích ảnh
          </label>
          <input id="chu-thich" className="o-nhap flex-1" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Ai, ở đâu, năm nào…" autoFocus />
          <button type="submit" className="btn-chinh py-1.5" disabled={caption.isPending}>
            Lưu
          </button>
          <button type="button" className="btn-phu py-1.5" onClick={() => setText(null)}>
            Huỷ
          </button>
        </form>
      )}
      {error && (
        <div className="mx-auto max-w-6xl px-4 pb-3">
          <FormError message={error.message} />
        </div>
      )}
    </div>
  );
}

function EditAlbum({ clanId, detail, onClose }: { clanId: string; detail: AlbumDetail; onClose: () => void }) {
  const album = detail.album!;
  const update = useUpdateAlbum(clanId, album.id);
  const remove = useDeleteAlbum(clanId, album.id);
  const router = useRouter();
  const [visibility, setVisibility] = useState<AlbumVisibility>(album.visibility);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePhotos, setDeletePhotos] = useState(false);
  const errs = fieldErrors(update.error);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    update.mutate({ title: String(data.get("title") ?? ""), description: String(data.get("description") ?? "") || null, visibility }, { onSuccess: onClose });
  }

  return (
    <div className="mt-6 max-w-xl rounded-md border border-[#d6c9ae] bg-the px-5 py-5">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <h2 className="font-serif text-xl">Sửa album</h2>
        <FormError message={update.error && Object.keys(errs).length === 0 ? update.error.message : null} />
        <Field label="Tên album" name="title" required maxLength={120} defaultValue={album.title} error={errs.title} />
        <label className="block">
          <span className="nhan">Mô tả (không bắt buộc)</span>
          <textarea name="description" rows={2} maxLength={2000} className="o-nhap" defaultValue={album.description ?? ""} />
        </label>
        <VisibilityChoice value={visibility} onChange={setVisibility} />
        <div className="flex gap-2">
          <button type="submit" className="btn-chinh" disabled={update.isPending}>
            {update.isPending ? "Đang lưu…" : "Lưu"}
          </button>
          <button type="button" className="btn-phu" onClick={onClose}>
            Huỷ
          </button>
        </div>
      </form>

      <div className="mt-6 border-t border-ngoc-200 pt-4">
        {!confirmDelete ? (
          <button type="button" className="text-sm font-medium text-loi underline-offset-4 hover:underline" onClick={() => setConfirmDelete(true)}>
            Xoá album này…
          </button>
        ) : (
          <fieldset className="space-y-2">
            <legend className="font-medium">Xoá album “{album.title}”</legend>
            {detail.photos.length > 0 && (
              <>
                <label className="flex gap-2">
                  <input type="radio" name="xoa" checked={!deletePhotos} onChange={() => setDeletePhotos(false)} className="accent-son" />
                  Giữ {detail.photos.length} ảnh, chuyển về “Ảnh lẻ”
                </label>
                <label className="flex gap-2">
                  <input type="radio" name="xoa" checked={deletePhotos} onChange={() => setDeletePhotos(true)} className="accent-son" />
                  Xoá luôn {detail.photos.length} ảnh (không lấy lại được)
                </label>
              </>
            )}
            <FormError message={remove.error?.message} />
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="btn-nguy"
                disabled={remove.isPending}
                onClick={() => remove.mutate(deletePhotos, { onSuccess: () => router.replace(`/dong-ho/${clanId}/anh`) })}
              >
                {remove.isPending ? "Đang xoá…" : "Xoá album"}
              </button>
              <button type="button" className="btn-phu" onClick={() => setConfirmDelete(false)}>
                Không xoá
              </button>
            </div>
          </fieldset>
        )}
      </div>
    </div>
  );
}
