"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  AnniversaryList,
  ContactMessage,
  DailyStats,
  LiveStats,
  Contact,
  ChildRelation,
  Clan,
  GrantableRole,
  HomeSettings,
  Invitation,
  JoinRequest,
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

export interface Instance {
  clanMode: "single" | "multi";
  clan: { id: string; name: string; surname: string } | null;
}
export const useInstance = () => useQuery({ queryKey: ["instance"], queryFn: () => api<Instance>("GET", "/instance") });

/** Giỗ trong `days` ngày tới (tính từ hôm nay theo giờ Việt Nam ở máy chủ) */
export const useAnniversaries = (clanId: string, days = 365) =>
  useQuery({
    queryKey: ["clan", clanId, "anniversaries", days],
    queryFn: () => api<AnniversaryList>("GET", `/clans/${clanId}/anniversaries?days=${days}`),
    staleTime: 10 * 60_000,
  });

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<User>("GET", "/me"), retry: false });
export const useMyClans = (enabled = true) => useQuery({ queryKey: keys.clans, queryFn: () => api<Clan[]>("GET", "/me/clans"), enabled });
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
    mutationFn: (v: { kind: RelativeKind | "first"; fromId?: string; unionId?: string; relation?: ChildRelation; person: PersonInput }) => {
      if (v.kind === "first") return api<Person>("POST", `/clans/${clanId}/persons`, v.person).then((p) => ({ person: p }));
      const path = { child: "children", spouse: "spouses", parent: "parents" }[v.kind];
      const body =
        v.kind === "child" ? { ...(v.unionId && { unionId: v.unionId }), ...(v.relation && { relation: v.relation }), person: v.person } : { person: v.person };
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

/** Đặt/đổi cha mẹ, hoặc đổi con ruột/nuôi/riêng */
export function useSetParentLink(clanId: string) {
  const invalidate = useInvalidateClan(clanId);
  return useMutation({
    mutationFn: (v: { personId: string; parentId: string; unionId?: string; relation: ChildRelation }) =>
      api<PersonDetail>("PUT", `/clans/${clanId}/persons/${v.personId}/parent-link`, {
        parentId: v.parentId,
        relation: v.relation,
        ...(v.unionId && { unionId: v.unionId }),
      }),
    onSuccess: invalidate,
  });
}

export function useReorderChildren(clanId: string) {
  const invalidate = useInvalidateClan(clanId);
  return useMutation({
    mutationFn: (v: { unionId: string; childIds: string[] }) => api<void>("PUT", `/clans/${clanId}/unions/${v.unionId}/children/order`, { childIds: v.childIds }),
    onSuccess: invalidate,
  });
}

export function useReorderUnions(clanId: string) {
  const invalidate = useInvalidateClan(clanId);
  return useMutation({
    mutationFn: (v: { personId: string; unionIds: string[] }) => api<void>("PUT", `/clans/${clanId}/persons/${v.personId}/unions/order`, { unionIds: v.unionIds }),
    onSuccess: invalidate,
  });
}

/** Gỡ quan hệ vợ chồng nhập nhầm (không xoá người) */
export function useRemoveUnion(clanId: string) {
  const invalidate = useInvalidateClan(clanId);
  return useMutation({
    mutationFn: (unionId: string) => api<void>("DELETE", `/clans/${clanId}/unions/${unionId}`),
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
  joinRequests: (clanId: string) => ["clan", clanId, "join-requests"] as const,
};

/** Yêu cầu tham gia chờ duyệt — `enabled` = chỉ hỏi khi là quản trị (người khác bị 403) */
export const useJoinRequests = (clanId: string, enabled = true) =>
  useQuery({
    queryKey: memberKeys.joinRequests(clanId),
    queryFn: () => api<JoinRequest[]>("GET", `/clans/${clanId}/join-requests`),
    enabled,
    refetchInterval: 60_000,
  });

export function useDecideJoinRequest(clanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; approve: boolean; role?: GrantableRole; personId?: string }) =>
      v.approve
        ? api<void>("POST", `/clans/${clanId}/join-requests/${v.id}/approve`, { role: v.role ?? "member", ...(v.personId && { personId: v.personId }) })
        : api<void>("POST", `/clans/${clanId}/join-requests/${v.id}/reject`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: memberKeys.joinRequests(clanId) });
      void qc.invalidateQueries({ queryKey: memberKeys.members(clanId) });
    },
  });
}

export function useCreateAccount(clanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: string; phone?: string; email?: string; role: GrantableRole; personId?: string }) =>
      api<{ member: Member; setPassword: { path: string; expiresAt: string } }>("POST", `/clans/${clanId}/members`, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.members(clanId) }),
  });
}

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

// ───────────── Ảnh & trang chủ ─────────────

export const useHome = (clanId: string) =>
  useQuery({ queryKey: ["clan", clanId, "home"], queryFn: () => api<HomeSettings>("GET", `/clans/${clanId}/site/home`) });

export function useSaveHome(clanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      banners: Array<{ mediaId: string; caption?: string | null }>;
      couplet: { left: string; right: string } | null;
      motto: string | null;
      templeAddress: string | null;
    }) =>
      api<HomeSettings>("PUT", `/clans/${clanId}/site/home`, v),
    onSuccess: (data) => qc.setQueryData(["clan", clanId, "home"], data),
  });
}

export function useSetAvatar(clanId: string) {
  const invalidate = useInvalidateClan(clanId);
  return useMutation({
    mutationFn: (v: { personId: string; mediaId: string | null }) => api<Person>("PUT", `/clans/${clanId}/persons/${v.personId}/avatar`, { mediaId: v.mediaId }),
    onSuccess: invalidate,
  });
}

// ───────────── Ban liên lạc ─────────────

export type ContactInput = Omit<Contact, "id" | "consentAt" | "consentNote"> & { consentNote?: string };
const contactsKey = (clanId: string) => ["clan", clanId, "contacts"] as const;

export const useContacts = (clanId: string) =>
  useQuery({ queryKey: contactsKey(clanId), queryFn: () => api<Contact[]>("GET", `/clans/${clanId}/contacts`) });

export function useSaveContact(clanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id?: string; data: ContactInput }) =>
      v.id ? api<Contact>("PATCH", `/clans/${clanId}/contacts/${v.id}`, v.data) : api<Contact>("POST", `/clans/${clanId}/contacts`, v.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactsKey(clanId) }),
  });
}

export function useDeleteContact(clanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>("DELETE", `/clans/${clanId}/contacts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactsKey(clanId) }),
  });
}

export function useReorderContacts(clanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api<void>("PUT", `/clans/${clanId}/contacts/order`, { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactsKey(clanId) }),
  });
}

/* ——— Thống kê truy cập, lời nhắn của khách (quản trị) ——— */

export const useLiveStats = (clanId: string) =>
  useQuery({
    queryKey: ["clan", clanId, "stats", "live"],
    queryFn: () => api<LiveStats>("GET", `/clans/${clanId}/stats/live`),
    refetchInterval: 30_000,
  });

export const useDailyStats = (clanId: string, from: string, to: string) =>
  useQuery({
    queryKey: ["clan", clanId, "stats", "daily", from, to],
    queryFn: () => api<DailyStats>("GET", `/clans/${clanId}/stats/daily?from=${from}&to=${to}`),
    refetchInterval: 120_000,
  });

const messagesKey = (clanId: string) => ["clan", clanId, "messages"] as const;

export const useMessages = (clanId: string, enabled = true) =>
  useQuery({
    queryKey: messagesKey(clanId),
    queryFn: () => api<{ items: ContactMessage[]; open: number }>("GET", `/clans/${clanId}/messages`),
    enabled,
    refetchInterval: 120_000,
  });

export function useMarkMessage(clanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; handled: boolean }) => api<ContactMessage>("PATCH", `/clans/${clanId}/messages/${v.id}`, { handled: v.handled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: messagesKey(clanId) }),
  });
}

export function useDeleteMessage(clanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>("DELETE", `/clans/${clanId}/messages/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: messagesKey(clanId) }),
  });
}
