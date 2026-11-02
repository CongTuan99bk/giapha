/** Kiểu dữ liệu trả về từ API v1 (khớp apps/api — xem PROJECT_CONTEXT mục 10). */

export type Gender = "male" | "female" | "unknown";
export type Privacy = "public" | "members" | "hidden";
export type ClanRole = "member" | "editor" | "admin" | "owner";

export interface FlexibleDate {
  calendar: "solar" | "lunar";
  precision: "day" | "month" | "year" | "approx";
  year: number;
  month?: number;
  day?: number;
  isLeapMonth?: boolean;
}

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
}

export interface Clan {
  id: string;
  name: string;
  slug: string;
  surname: string;
  originPlace: string | null;
  lineageMode: "patrilineal" | "matrilineal";
  kinshipVariant: "bac" | "trung" | "nam";
  day30Rule: "day29" | "nextMonthDay1";
  rootPersonId: string | null;
  role: ClanRole;
  myPersonId?: string | null;
}

export interface PersonBrief {
  id: string;
  fullName: string;
  gender: Gender;
  birthYear: number | null;
}

export interface Person extends PersonBrief {
  otherNames: Array<{ type: string; value: string }>;
  isLiving: boolean;
  birthDate: FlexibleDate | null;
  deathDate: FlexibleDate | null;
  deathAnniversaryLunar: { day: number; month: number; isLeapMonth: boolean } | null;
  generation: number | null;
  inClan: boolean;
  lineagePath: string | null;
  privacy: Privacy;
  avatarMediaId: string | null;
  biography: unknown;
  version: number;
  updatedAt: string;
}

export interface PersonDetail extends Person {
  parents: Array<PersonBrief & { relation: string }>;
  unions: Array<{
    id: string;
    orderIndex: number;
    partner: PersonBrief | null;
    children: Array<PersonBrief & { relation: string; birthOrder: number }>;
  }>;
}

export interface PersonListItem extends PersonBrief {
  deathYear: number | null;
  generation: number | null;
  isLiving: boolean;
  inClan: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TreeNode {
  personId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  isSpouse: boolean;
  hasHiddenChildren: boolean;
  person: {
    id: string;
    fullName: string;
    gender: Gender;
    birthYear: number | null;
    deathYear: number | null;
    isLiving: boolean;
    generation: number | null;
    inClan: boolean;
    hasAvatar: boolean;
    avatarMediaId: string | null;
  };
}

export interface TreeEdge {
  unionId: string;
  childId: string;
  relation: "biological" | "adopted" | "step";
  /** Đường gấp khúc [x, y] từ cặp cha mẹ xuống con */
  points: Array<[number, number]>;
}

export interface TreeLayout {
  rootId: string | null;
  nodes: TreeNode[];
  edges: TreeEdge[];
  width: number;
  height: number;
}

export interface KinshipResult {
  related: boolean;
  message?: string;
  aCallsB?: string;
  bCallsA?: string;
  kind?: string;
  side?: string | null;
  generationGap?: number;
  viaMarriage?: boolean;
  commonAncestorId?: string | null;
  path?: string[];
}

/** Dữ liệu gửi lên khi tạo người */
export interface PersonInput {
  fullName: string;
  gender: Gender;
  isLiving: boolean;
  birthDate?: FlexibleDate | null;
  deathDate?: FlexibleDate | null;
  privacy?: Privacy;
}

export type GrantableRole = Exclude<ClanRole, "owner">;

export interface Member {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** Tài khoản do quản trị tạo, người dùng chưa đặt mật khẩu lần đầu */
  passwordPending: boolean;
  role: ClanRole;
  person: { id: string; fullName: string } | null;
  joinedAt: string;
}

/** Người tự đăng ký đang chờ quản trị duyệt */
export interface JoinRequest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  createdAt: string;
}

export interface MyJoinRequest {
  status: "pending" | "approved" | "rejected";
  message: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export type InvitationStatus = "active" | "expired" | "revoked" | "used";

export interface Invitation {
  id: string;
  role: GrantableRole;
  email: string | null;
  maxUses: number;
  useCount: number;
  expiresAt: string;
  createdAt: string;
  createdBy: string | null;
  person: { id: string; fullName: string } | null;
  status: InvitationStatus;
  /** Chỉ có ngay sau khi tạo */
  token?: string;
}

export interface InvitationPreview {
  clanId: string;
  clanName: string;
  surname: string;
  role: GrantableRole;
  invitedBy: string | null;
  expiresAt: string;
  forSpecificEmail: boolean;
  status: InvitationStatus;
}

export type ImageVariant = "sm" | "md" | "lg" | "orig";

export interface MediaItem {
  id: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  sizeBytes: number;
  createdAt: string;
  urls: Record<ImageVariant, string>;
}

export interface HomeSettings {
  banners: MediaItem[];
  couplet: { left: string; right: string } | null;
  motto: string | null;
  stats: { people: number; generations: number };
}

/** Một lần giỗ sắp tới (API /clans/:id/anniversaries) */
export interface UpcomingAnniversary {
  personId: string;
  fullName: string;
  gender: Gender;
  generation: number | null;
  inClan: boolean;
  deathYear: number | null;
  lunar: { day: number; month: number; year: number; isLeapMonth: boolean };
  /** YYYY-MM-DD */
  solarDate: string;
  /** 0 = Chủ nhật */
  weekday: number;
  daysUntil: number;
  /** 1 = giỗ đầu, 2 = giỗ hết */
  nth: number | null;
  adjustments: Array<"leap-month-to-regular" | "day30-to-day29" | "day30-to-next-month">;
}

export interface AnniversaryList {
  from: string;
  days: number;
  items: UpcomingAnniversary[];
  missingDeathDay: number;
}
