import type { ClanRole } from "./types";

/** Thứ bậc vai trò — khớp ROLE_RANK ở apps/api/src/common/context.ts */
export const ROLE_RANK: Record<ClanRole, number> = { member: 0, editor: 1, admin: 2, owner: 3 };

export const ROLE_LABEL: Record<ClanRole, string> = {
  member: "Thành viên",
  editor: "Người nhập liệu",
  admin: "Quản trị",
  owner: "Chủ sở hữu",
};

export const ROLE_HINT: Record<ClanRole, string> = {
  member: "Xem phả đồ, tra xưng hô",
  editor: "Thêm, sửa người trong phả",
  admin: "Như người nhập liệu, thêm mời và quản lý thành viên",
  owner: "Toàn quyền, không ai đổi được vai trò này",
};

/** Khớp quy tắc API: chỉ cấp vai trò thấp hơn mình; chỉ quản lý người thấp hơn mình. */
export const grantableRoles = (actor: ClanRole) => (["member", "editor", "admin"] as const).filter((r) => ROLE_RANK[r] < ROLE_RANK[actor]);
export const canManage = (actor: ClanRole, target: ClanRole) => ROLE_RANK[target] < ROLE_RANK[actor];
