"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { AlbumDetail, AlbumList, AnniversaryList, PersonDetail, PublicCounter, PublicSite, SiteMusic, TreeLayout } from "./types";

/** Trang công khai: dữ liệu không cần đăng nhập (/api/v1/public/…) */
export const publicMediaUrl = (id: string, variant: "sm" | "md" | "lg") => `/api/v1/public/media/${id}/${variant}`;

export const usePublicSite = () =>
  useQuery({ queryKey: ["public", "site"], queryFn: () => api<PublicSite>("GET", "/public/site"), retry: false, staleTime: 5 * 60_000 });

export const usePublicTree = () => useQuery({ queryKey: ["public", "tree"], queryFn: () => api<TreeLayout>("GET", "/public/tree"), staleTime: 5 * 60_000 });

/** Hồ sơ công khai: như PersonDetail nhưng đã lược người thân còn sống / không công khai */
export type PublicPerson = Pick<
  PersonDetail,
  | "id"
  | "fullName"
  | "otherNames"
  | "gender"
  | "birthDate"
  | "deathDate"
  | "deathAnniversaryLunar"
  | "generation"
  | "inClan"
  | "avatarMediaId"
  | "biography"
  | "facts"
  | "childOf"
> & { unions: Array<Omit<PersonDetail["unions"][number], "isPartnerA">> };

export const usePublicPerson = (id: string | null) =>
  useQuery({
    queryKey: ["public", "person", id],
    queryFn: () => api<PublicPerson>("GET", `/public/persons/${id}`),
    enabled: Boolean(id),
    retry: false,
  });

export const usePublicAnniversaries = (days = 365) =>
  useQuery({
    queryKey: ["public", "anniversaries", days],
    queryFn: () => api<AnniversaryList>("GET", `/public/anniversaries?days=${days}`),
    staleTime: 10 * 60_000,
  });

/** Bộ đếm "đang xem / hôm nay / tổng" — làm mới mỗi phút */
export const usePublicCounter = () =>
  useQuery({ queryKey: ["public", "stats"], queryFn: () => api<PublicCounter>("GET", "/public/stats"), refetchInterval: 60_000, retry: false });

/** Thư viện ảnh công khai */
export const usePublicAlbums = () => useQuery({ queryKey: ["public", "albums"], queryFn: () => api<AlbumList>("GET", "/public/albums"), staleTime: 60_000 });

export const usePublicAlbum = (id: string | null) =>
  useQuery({
    queryKey: ["public", "album", id],
    queryFn: () => api<AlbumDetail>("GET", `/public/albums/${id}`),
    enabled: Boolean(id),
    retry: false,
    staleTime: 60_000,
  });

/** Nhạc nền trên trang công khai */
export const usePublicMusic = () =>
  useQuery({ queryKey: ["public", "music"], queryFn: () => api<{ music: SiteMusic | null }>("GET", "/public/music"), retry: false, staleTime: 10 * 60_000 });
