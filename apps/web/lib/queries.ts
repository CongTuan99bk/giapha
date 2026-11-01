"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  Clan,
  GrantableRole,
  Invitation,
  KinshipResult,
  Member,
  Page,
  Person,
  PersonDetail,
  PersonInput,
  PersonListItem,
  TreeLayout,
  User,
} from "./types";

export const keys = {
  me: ["me"] as const,
  clans: ["clans"] as const,
  clan: (id: string) => ["clan", id] as const,
  tree: (id: string) => ["clan", id, "tree"] as const,
  person: (clanId: string, id: string) => ["clan", clanId, "person", id] as const,
  persons: (clanId: string, q: string) => ["clan", clanId, "persons", q] as const,
  kinship: (clanId: string, a: string, b: string) => ["clan", clanId, "kinship", a, b] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<User>("GET", "/me"), retry: false });
export const useMyClans = () => useQuery({ queryKey: keys.clans, queryFn: () => api<Clan[]>("GET", "/me/clans") });
export const useClan = (id: string) => useQuery({ queryKey: keys.clan(id), queryFn: () => api<Clan>("GET", `/clans/${id}`) });
export const useTree = (clanId: string) =>
  useQuery({ queryKey: keys.tree(clanId), queryFn: () => api<TreeLayout>("GET", `/clans/${clanId}/tree`) });
export const usePerson = (clanId: string, id: string | null) =>
  useQuery({
    queryKey: keys.person(clanId, id ?? ""),
    queryFn: () => api<PersonDetail>("GET", `/clans/${clanId}/persons/${id}`),
    enabled: Boolean(id),
  });
export const usePersonSearch = (clanId: string, q: string) =>
  useQuery({
    queryKey: keys.persons(clanId, q),
    queryFn: () => api<Page<PersonListItem>>("GET", `/clans/${clanId}/persons?pageSize=50&q=${encodeURIComponent(q)}`),
    placeholderData: (prev) => prev,
  });
export const useKinship = (clanId: string, a: string | null, b: string | null) =>
  useQuery({
    queryKey: keys.kinship(clanId, a ?? "", b ?? ""),
    queryFn: () => api<KinshipResult>("GET", `/clans/${clanId}/kinship?a=${a}&b=${b}`),
    enabled: Boolean(a && b && a !== b),
  });

/** Mọi thay đổi trong cây làm mới phả đồ, danh sách, chi tiết người và dòng họ (thuỷ tổ có thể đổi). */
function useInvalidateClan(clanId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["clan", clanId] });
}

export type RelativeKind = "child" | "spouse" | "parent";

export function useAddPerson(clanId: string) {
  const invalidate = useInvalidateClan(clanId);
  return useMutation({
    mutationFn: (v: { kind: RelativeKind | "first"; fromId?: string; unionId?: string; person: PersonInput }) => {
      if (v.kind === "first") return api<Person>("POST", `/clans/${clanId}/persons`, v.person).then((p) => ({ person: p }));
      const path = { child: "children", spouse: "spouses", parent: "parents" }[v.kind];
      const body = v.kind === "child" && v.unionId ? { unionId: v.unionId, person: v.person } : { person: v.person };
      return api<{ unionId: string; person: Person }>("POST", `/clans/${clanId}/persons/${v.fromId}/${path}`, body);
    },
    onSuccess: invalidate,
  });
}

export function useUpdatePerson(clanId: string) {
  const invalidate = useInvalidateClan(clanId);
  return useMutation({
    mutationFn: (v: { id: string; patch: Partial<PersonInput> & { version: number } }) =>
      api<Person>("PATCH", `/clans/${clanId}/persons/${v.id}`, v.patch),
    onSuccess: invalidate,
  });
}

export function useDeletePerson(clanId: string) {
  const invalidate = useInvalidateClan(clanId);
  return useMutation({
    mutationFn: (v: { id: string; confirm: boolean }) =>
      api<void>("DELETE", `/clans/${clanId}/persons/${v.id}${v.confirm ? "?confirm=true" : ""}`),
    onSuccess: invalidate,
  });
}

export function useUpdateClan(clanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Pick<Clan, "name" | "surname" | "originPlace" | "rootPersonId" | "kinshipVariant">>) =>
      api<Clan>("PATCH", `/clans/${clanId}`, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clan", clanId] });
      void qc.invalidateQueries({ queryKey: keys.clans });
    },
  });
}

// ───────────── Thành viên & lời mời ─────────────

export const memberKeys = {
  members: (clanId: string) => ["clan", clanId, "members"] as const,
  invitations: (clanId: string) => ["clan", clanId, "invitations"] as const,
};

export const useMembers = (clanId: string) =>
  useQuery({ queryKey: memberKeys.members(clanId), queryFn: () => api<Member[]>("GET", `/clans/${clanId}/members`) });

export const useInvitations = (clanId: string) =>
  useQuery({ queryKey: memberKeys.invitations(clanId), queryFn: () => api<Invitation[]>("GET", `/clans/${clanId}/invitations`) });

export function useCreateInvitation(clanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { role: GrantableRole; email?: string; personId?: string; expiresInDays: number; maxUses: number }) =>
      api<Invitation>("POST", `/clans/${clanId}/invitations`, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.invitations(clanId) }),
  });
}

export function useRevokeInvitation(clanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>("DELETE", `/clans/${clanId}/invitations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.invitations(clanId) }),
  });
}

export function useUpdateMember(clanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; role?: GrantableRole; personId?: string | null }) =>
      api<Member>("PATCH", `/clans/${clanId}/members/${v.id}`, { role: v.role, personId: v.personId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.members(clanId) }),
  });
}

export function useRemoveMember(clanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>("DELETE", `/clans/${clanId}/members/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.members(clanId) }),
  });
}

/** "Đây là tôi" */
export function useLinkMe(clanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (personId: string | null) => api<Member>("PATCH", `/clans/${clanId}/me/person`, { personId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clan", clanId] }),
  });
}
