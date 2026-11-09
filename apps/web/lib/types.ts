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
  deathAnniversaryLunar: LunarAnniversary | null;
  generation: number | null;
  inClan: boolean;
  lineagePath: string | null;
  privacy: Privacy;
  avatarMediaId: string | null;
  biography: { text: string } | null;
  version: number;
  updatedAt: string;
}

export type ChildRelation = "biological" | "adopted" | "step";
export type OtherNameType = "huy" | "tu" | "thuy" | "hieu" | "khac";
export type FactType = "birthPlace" | "burialPlace" | "occupation";

export interface PersonDetail extends Person {
  /** Quê quán, nơi an táng, nghề nghiệp — chỉ có trường đã nhập */
  facts: Partial<Record<FactType, string>>;
  /** Cha mẹ theo từng cặp: con thứ mấy trên tổng số, ruột/nuôi/riêng */
  childOf: Array<{ unionId: string; relation: ChildRelation; birthOrder: number; siblings: number; parents: PersonBrief[] }>;
  parents: Array<PersonBrief & { relation: string }>;
  unions: Array<{
    id: string;
    orderIndex: number;
    /** Người này đứng đầu cặp — mới xếp được thứ tự vợ cả, vợ hai */
    isPartnerA: boolean;
    partner: PersonBrief | null;
    children: Array<PersonBrief & { relation: ChildRelation; birthOrder: number }>;
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
  /** Ngày giỗ âm lịch ghi riêng khi không rõ ngày mất đủ ngày tháng */
  deathAnniversaryLunar?: LunarAnniversary | null;
  privacy?: Privacy;
  otherNames?: Array<{ type: OtherNameType; value: string }>;
  /** null = xoá trường đó */
  facts?: Partial<Record<FactType, string | null>>;
  biography?: { text: string } | null;
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
  /** Album chứa ảnh; null = ảnh lẻ */
  albumId: string | null;
  sizeBytes: number;
  createdAt: string;
  urls: Record<ImageVariant, string>;
}

export interface HomeSettings {
  banners: MediaItem[];
  couplet: { left: string; right: string } | null;
  motto: string | null;
  templeAddress: string | null;
  stats: { people: number; generations: number };
}

/** Người liên hệ (quản trị xem đầy đủ) */
export interface Contact {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  showPhone: boolean;
  showEmail: boolean;
  consent: boolean;
  consentAt: string | null;
  consentNote: string | null;
}

/** Trang công khai (/api/v1/public/site) */
export interface PublicSite {
  clan: { name: string; surname: string; originPlace: string | null };
  home: {
    banners: Array<{ id: string; width: number | null; height: number | null; caption: string | null; urls: { sm: string; md: string; lg: string } }>;
    couplet: { left: string; right: string } | null;
    motto: string | null;
    templeAddress: string | null;
  };
  stats: { people: number; generations: number };
  contacts: Array<{ name: string; role: string; phone: string | null; email: string | null }>;
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

/** Thống kê truy cập (API /clans/:id/stats/…) */
export interface LiveStats {
  online: number;
  guests: number;
  members: number;
  pages: Array<{ path: string; online: number }>;
  at: string;
}

export interface DailyStats {
  from: string;
  to: string;
  days: Array<{ date: string; pageViews: number; uniqueVisitors: number; memberViews: number }>;
  allTimeViews: number;
  pages: Array<{ key: string; views: number }>;
  referrers: Array<{ key: string; views: number }>;
  devices: Array<{ key: string; views: number }>;
  persons: Array<{ key: string; views: number; fullName: string }>;
}

/** Bộ đếm nhỏ ở trang công khai */
export interface PublicCounter {
  online: number;
  today: number;
  total: number;
}

/** Lời nhắn khách gửi từ trang công khai */
export interface ContactMessage {
  id: string;
  name: string;
  /** Số điện thoại (+84…) hoặc email */
  replyTo: string;
  message: string;
  createdAt: string;
  handledAt: string | null;
}

/** Ảnh trong thư viện: thành viên có đủ cỡ + ảnh gốc; khách chỉ có cỡ xem */
export interface Photo {
  id: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  urls: { sm: string; md: string; lg: string; orig?: string };
}

export type AlbumVisibility = "public" | "members";

export interface Album {
  id: string;
  title: string;
  description: string | null;
  /** public: khách xem được; members: chỉ con cháu đã đăng nhập */
  visibility: AlbumVisibility;
  coverId: string | null;
  createdAt: string;
  count: number;
  cover: Photo | null;
  lastAddedAt: string | null;
}

export interface AlbumList {
  albums: Album[];
  /** Ảnh chưa xếp album (chỉ thành viên thấy) */
  loose?: { count: number };
}

export interface AlbumDetail {
  /** null = trang "Ảnh lẻ" */
  album: Omit<Album, "count" | "cover" | "lastAddedAt"> | null;
  photos: Photo[];
}

/* ——— Nhập – xuất ——— */

export type ImportColumn =
  | "ma"
  | "hoTen"
  | "gioiTinh"
  | "maCha"
  | "maMe"
  | "quanHe"
  | "thuTu"
  | "maVoChong"
  | "tenKhac"
  | "ngaySinh"
  | "daMat"
  | "ngayMat"
  | "ngayGio"
  | "queQuan"
  | "ngheNghiep"
  | "noiAnTang"
  | "tieuSu";

export interface ImportIssue {
  row: number;
  column: ImportColumn | null;
  message: string;
}

export interface ImportSummary {
  newPeople: number;
  skippedExisting: number;
  newUnions: number;
  links: number;
  deceased: number;
  generations: [number, number] | null;
  rootName: string | null;
}

export interface ImportCheck {
  id: string;
  ok: boolean;
  fileName: string;
  summary: ImportSummary | null;
  errorCount: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

export interface ImportHistoryItem {
  id: string;
  status: "checked" | "failed" | "done" | "reverted";
  fileName: string;
  summary: ImportSummary | null;
  errorCount: number;
  createdAt: string;
  committedAt: string | null;
  revertedAt: string | null;
  by: string | null;
  canRevert: boolean;
  revertUntil: string | null;
}

export type Paper = "A4" | "A3" | "A2" | "A1" | "A0" | "cuon";
export type PdfLayout = "tu-dong" | "mot-trang" | "nhieu-trang";

export interface TreeExportInfo {
  people: number;
  generations: number;
  pages: number;
  cols: number;
  rows: number;
  pageWidthCm: number;
  pageHeightCm: number;
  nameHeightMm: number;
  readable: boolean;
}

/** Ngày giỗ âm lịch: ngày/tháng, không năm */
export interface LunarAnniversary {
  day: number;
  month: number;
  isLeapMonth: boolean;
}

/** Nhạc nền của dòng họ (một bài, khách tự bật — mặc định tắt) */
export interface SiteMusic {
  title: string;
  mime: string;
  sizeBytes: number;
  updatedAt: string;
  /** Đường dẫn file, có `?v=` đổi mỗi lần thay bài */
  url: string;
}

/** Kết quả quản trị sửa tài khoản thành viên */
export interface MemberAccount {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  passwordSet: boolean;
}
