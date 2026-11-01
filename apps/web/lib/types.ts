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
  email: string;
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
