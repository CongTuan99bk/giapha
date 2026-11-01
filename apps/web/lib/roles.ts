import type { ClanRole } from "./types";

/** Thứ bậc vai trò — khớp ROLE_RANK ở apps/api/src/common/context.ts */
export const ROLE_RANK: Record<ClanRole, number> = { member: 0, editor: 1, admin: 2, owner: 3 };

export const ROLE_LABEL: Record<ClanRole, string> = {
  member: "Thành viên",
  editor: "Người nhập liệu",
  admin: "Quản trị",
  owner: "Chủ sở hữu",
};
