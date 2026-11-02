"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useHome, useSaveHome } from "@/lib/queries";
import { uploadImage } from "@/lib/upload";
import type { MediaItem } from "@/lib/types";
import { FormError } from "./field";

type Banner = MediaItem & { caption: string | null };

/** Cài đặt trang chủ: ảnh banner (nhiều ảnh, tự trượt), câu đối hai bên, khẩu hiệu. */
export function HomeSettingsForm({ clanId }: { clanId: string }) {
  const home = useHome(clanId);
  const save = useSaveHome(clanId);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [motto, setMotto] = useState("");
  const [address, setAddress] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!home.data || loaded) return;
    setBanners(home.data.banners);
    setLeft(home.data.couplet?.left ?? "");
    setRight(home.data.couplet?.right ?? "");
    setMotto(home.data.motto ?? "");
    setAddress(home.data.templeAddress ?? "");
    setLoaded(true);
  }, [home.data, loaded]);

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setSaved(false);
    const list = [...files];
    for (const [i, f] of list.entries()) {
      setUploading(`Đang tải ảnh ${i + 1}/${list.length}: ${f.name}`);
      try {
        const m = await uploadImage(clanId, f);
        setBanners((b) => [...b, m]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không tải được ảnh.");
        break;
      }
    }
    setUploading(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  const move = (i: number, d: -1 | 1) =>
    setBanners((b) => {
      const j = i + d;
      if (j < 0 || j >= b.length) return b;
      const next = [...b];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      const res = await save.mutateAsync({
        banners: banners.map((b) => ({ mediaId: b.id, caption: b.caption?.trim() || null })),
        couplet: left.trim() || right.trim() ? { left: left.trim(), right: right.trim() } : null,
        motto: motto.trim() || null,
        templeAddress: address.trim() || null,
      });
      setBanners(res.banners);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được.");
    }
  }

  if (!loaded) return <p className="text-reu">Đang tải…</p>;
  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <FormError message={error} />
      <div>
        <h3 className="font-medium">Ảnh banner</h3>
        <p className="mt-1 text-sm text-reu">
          Nhiều ảnh sẽ tự trượt lần lượt và quay vòng. Nên dùng ảnh ngang, rộng từ 1600 điểm ảnh trở lên (ảnh nhà thờ họ, cổng làng, đại gia đình).
          Ảnh được tự xoá thông tin vị trí chụp trước khi lưu.
        </p>
        {banners.length > 0 && (
          <ol className="mt-4 space-y-3">
            {banners.map((b, i) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-md border border-ngoc-200 bg-giay p-2">
                <img src={b.urls.md} alt="" className="h-16 w-28 rounded object-cover" />
                <input
                  aria-label={`Chú thích ảnh ${i + 1}`}
                  placeholder="Chú thích (không bắt buộc)"
                  className="o-nhap min-w-0 flex-1 basis-48"
                  value={b.caption ?? ""}
                  maxLength={120}
                  onChange={(e) => setBanners((all) => all.map((x) => (x.id === b.id ? { ...x, caption: e.target.value } : x)))}
                />
                <div className="flex gap-1">
                  <button type="button" className="btn-phu px-3" aria-label={`Đưa ảnh ${i + 1} lên trước`} onClick={() => move(i, -1)} disabled={i === 0}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn-phu px-3"
                    aria-label={`Đưa ảnh ${i + 1} ra sau`}
                    onClick={() => move(i, 1)}
                    disabled={i === banners.length - 1}
                  >
                    ↓
                  </button>
                  <button type="button" className="btn-nguy" onClick={() => setBanners((all) => all.filter((x) => x.id !== b.id))}>
                    Bỏ
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className={`btn-phu cursor-pointer ${uploading || banners.length >= 12 ? "pointer-events-none opacity-50" : ""}`}>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => void addFiles(e.target.files)}
              disabled={Boolean(uploading) || banners.length >= 12}
            />
            Thêm ảnh banner
          </label>
          {uploading && (
            <span role="status" className="text-sm text-reu">
              {uploading}
            </span>
          )}
          {banners.length >= 12 && <span className="text-sm text-reu">Tối đa 12 ảnh.</span>}
        </div>
      </div>

      <div>
        <h3 className="font-medium">Câu đối hai bên banner</h3>
        <p className="mt-1 text-sm text-reu">Hiện dọc hai bên ảnh trên máy tính, dưới ảnh trên điện thoại. Để trống cả hai vế nếu không dùng.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="nhan">Vế bên trái</span>
            <input className="o-nhap font-serif" maxLength={40} value={left} onChange={(e) => setLeft(e.target.value)} placeholder="Cây có cội mới nảy cành xanh lá" />
          </label>
          <label>
            <span className="nhan">Vế bên phải</span>
            <input className="o-nhap font-serif" maxLength={40} value={right} onChange={(e) => setRight(e.target.value)} placeholder="Nước có nguồn mới bể rộng sông sâu" />
          </label>
        </div>
      </div>

      <label className="block">
        <span className="nhan">Khẩu hiệu dưới tên dòng họ</span>
        <input className="o-nhap font-serif" maxLength={80} value={motto} onChange={(e) => setMotto(e.target.value)} placeholder="Uống nước nhớ nguồn" />
      </label>

      <label className="block">
        <span className="nhan">Địa chỉ nhà thờ họ</span>
        <input
          className="o-nhap"
          maxLength={200}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Ví dụ: Thôn Đông, xã An Hoà, huyện Hoài Nhơn, Bình Định"
        />
        <span className="mt-1 block text-sm text-reu">Hiện trên trang chủ và trang công khai, kèm nút mở bản đồ để con cháu tìm đường về.</span>
      </label>

      <div className="flex items-center gap-4">
        <button type="submit" className="btn-chinh" disabled={save.isPending || Boolean(uploading)}>
          {save.isPending ? "Đang lưu…" : "Lưu trang chủ"}
        </button>
        {saved && (
          <span role="status" className="text-sm text-reu">
            Đã lưu. Xem ở thẻ Trang chủ.
          </span>
        )}
      </div>
    </form>
  );
}
