"use client";

import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { AlbumCard, AlbumGrid, VisibilityChoice } from "@/components/albums";
import { Field, FormError } from "@/components/field";
import { fieldErrors } from "@/lib/api";
import { LOOSE_ALBUM, useAlbums, useClan, useCreateAlbum } from "@/lib/queries";
import { ROLE_RANK } from "@/lib/roles";
import type { AlbumVisibility } from "@/lib/types";

/** Thư viện ảnh của dòng họ: các album (giỗ Tổ, họp họ, nhà thờ…) và ảnh lẻ */
export default function AlbumsPage() {
  const { clanId } = useParams<{ clanId: string }>();
  const clan = useClan(clanId);
  const list = useAlbums(clanId);
  const canEdit = clan.data ? ROLE_RANK[clan.data.role] >= ROLE_RANK.editor : false;
  const [creating, setCreating] = useState(false);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 pb-20 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl">Thư viện ảnh</h1>
            <p className="mt-1 max-w-prose text-reu">Ảnh giỗ Tổ, họp họ, nhà thờ, ảnh xưa của ông bà — xếp theo từng album.</p>
          </div>
          {canEdit && !creating && (
            <button type="button" className="btn-chinh" onClick={() => setCreating(true)}>
              Tạo album
            </button>
          )}
        </div>

        {creating && <CreateAlbumForm clanId={clanId} onCancel={() => setCreating(false)} />}

        <div className="mt-8">
          {list.error && <FormError message={list.error.message} />}
          {list.isPending && <p className="text-reu">Đang tải…</p>}
          {list.data && list.data.albums.length === 0 && !list.data.loose?.count && (
            <p className="max-w-prose">{canEdit ? "Chưa có album nào. Bấm “Tạo album” để bắt đầu, ví dụ “Giỗ Tổ năm 2026”." : "Chưa có album nào."}</p>
          )}
          {list.data && (list.data.albums.length > 0 || Boolean(list.data.loose?.count)) && (
            <AlbumGrid
              albums={list.data.albums}
              showVisibility
              hrefOf={(a) => `/dong-ho/${clanId}/anh/${a.id}`}
              extra={
                list.data.loose?.count ? (
                  <li>
                    <AlbumCard
                      href={`/dong-ho/${clanId}/anh/${LOOSE_ALBUM}`}
                      title="Ảnh lẻ"
                      cover={null}
                      meta={[`${list.data.loose.count.toLocaleString("vi-VN")} ảnh chưa xếp album`, "chân dung, banner…"]}
                    />
                  </li>
                ) : null
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CreateAlbumForm({ clanId, onCancel }: { clanId: string; onCancel: () => void }) {
  const create = useCreateAlbum(clanId);
  const router = useRouter();
  const [visibility, setVisibility] = useState<AlbumVisibility>("members");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const album = await create
      .mutateAsync({ title: String(data.get("title") ?? ""), description: String(data.get("description") ?? "") || null, visibility })
      .catch(() => null);
    // tạo xong mở album để thêm ảnh ngay
    if (album) router.push(`/dong-ho/${clanId}/anh/${album.id}`);
  }

  const errs = fieldErrors(create.error);
  return (
    <form onSubmit={submit} className="mt-6 max-w-xl space-y-4 rounded-md border border-[#d6c9ae] bg-the px-5 py-5" noValidate>
      <h2 className="font-serif text-xl">Album mới</h2>
      <FormError message={create.error && Object.keys(errs).length === 0 ? create.error.message : null} />
      <Field label="Tên album" name="title" required maxLength={120} placeholder="Ví dụ: Giỗ Tổ năm 2026" error={errs.title} autoFocus />
      <label className="block">
        <span className="nhan">Mô tả (không bắt buộc)</span>
        <textarea name="description" rows={2} maxLength={2000} className="o-nhap" placeholder="Ngày, nơi chụp, ai có mặt…" />
      </label>
      <VisibilityChoice value={visibility} onChange={setVisibility} />
      <div className="flex gap-2">
        <button type="submit" className="btn-chinh" disabled={create.isPending}>
          {create.isPending ? "Đang tạo…" : "Tạo album"}
        </button>
        <button type="button" className="btn-phu" onClick={onCancel}>
          Huỷ
        </button>
      </div>
    </form>
  );
}
