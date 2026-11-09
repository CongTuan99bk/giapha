"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AlbumGrid, PhotoGrid } from "@/components/albums";
import { PublicCounter } from "@/components/public-counter";
import { usePublicAlbum, usePublicAlbums } from "@/lib/public";

/** Thư viện ảnh công khai: album ban quản lý để "Công khai". `?album=<mã>` mở một album. */
export default function PublicAlbumsPage() {
  return (
    <Suspense fallback={null}>
      <PublicAlbums />
    </Suspense>
  );
}

function PublicAlbums() {
  const albumId = useSearchParams().get("album");
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-8">{albumId ? <OneAlbum id={albumId} /> : <AllAlbums />}</div>
    </div>
  );
}

function AllAlbums() {
  const list = usePublicAlbums();
  return (
    <>
      <h1 className="font-serif text-3xl">Thư viện ảnh</h1>
      <p className="mt-1 max-w-prose text-reu">Ảnh giỗ Tổ, họp họ, nhà thờ họ. Con cháu đăng nhập xem được thêm album dành riêng cho thành viên.</p>
      <div className="mt-8">
        {list.isPending && <p className="text-reu">Đang tải…</p>}
        {list.error && <p className="text-loi">{list.error.message}</p>}
        {list.data && list.data.albums.length === 0 && <p>Chưa có album công khai.</p>}
        {list.data && list.data.albums.length > 0 && <AlbumGrid albums={list.data.albums} hrefOf={(a) => `/xem/anh?album=${a.id}`} />}
      </div>
      <PublicCounter />
    </>
  );
}

function OneAlbum({ id }: { id: string }) {
  const detail = usePublicAlbum(id);
  return (
    <>
      <Link href="/xem/anh" className="text-sm text-son underline-offset-4 hover:underline">
        ← Thư viện ảnh
      </Link>
      {detail.isPending && <p className="mt-6 text-reu">Đang tải…</p>}
      {detail.error && <p className="mt-6">Không tìm thấy album này, hoặc album chỉ dành cho thành viên.</p>}
      {detail.data?.album && (
        <>
          <h1 className="mt-3 font-serif text-3xl">{detail.data.album.title}</h1>
          <p className="mt-1 text-reu">{detail.data.photos.length.toLocaleString("vi-VN")} ảnh</p>
          {detail.data.album.description && <p className="mt-2 max-w-prose whitespace-pre-line">{detail.data.album.description}</p>}
          <div className="mt-6">
            <PhotoGrid photos={detail.data.photos} />
          </div>
        </>
      )}
    </>
  );
}
