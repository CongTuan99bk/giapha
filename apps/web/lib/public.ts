"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { AnniversaryList, PersonDetail, PublicSite, TreeLayout } from "./types";

/** Trang công khai: dữ liệu không cần đăng nhập (/api/v1/public/…) */
export const publicMediaUrl = (id: string, variant: "sm" | "md" | "lg") => `/api/v1/public/media/${id}/${variant}`;

export const usePublicSite = () =>
  useQuery({ queryKey: ["public", "site"], queryFn: () => api<PublicSite>("GET", "/public/site"), retry: false, staleTime: 5 * 60_000 });

export const usePublicTree = () => useQuery({ queryKey: ["public", "tree"], queryFn: () => api<TreeLayout>("GET", "/public/tree"), staleTime: 5 * 60_000 });

/** Hồ sơ công khai: như PersonDetail nhưng đã lược người thân còn sống / không công khai */
export type PublicPerson = Pick<
  PersonDetail,
  "id" | "fullName" | "otherNames" | "gender" | "birthDate" | "deathDate" | "deathAnniversaryLunar" | "generation" | "inClan" | "avatarMediaId" | "biography" | "facts" | "childOf"
> & { unions: Array<Omit<PersonDetail["unions"][number], "isPartnerA">> };

export const usePublicPerson = (id: string | null) =>
  useQuery({
    queryKey: ["public", "person", id],
    queryFn: () => api<PublicPerson>("GET", `/public/persons/${id}`),
    enabled: Boolean(id),
    retry: false,
  });

export const usePublicAnniversaries = (days = 365) =>
  useQuery({ queryKey: ["public", "anniversaries", days], queryFn: () => api<AnniversaryList>("GET", `/public/anniversaries?days=${days}`), staleTime: 10 * 60_000 });
