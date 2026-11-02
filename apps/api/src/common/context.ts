import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Request } from "express";

export type ClanRole = "member" | "editor" | "admin" | "owner";
export const ROLE_RANK: Record<ClanRole, number> = { member: 0, editor: 1, admin: 2, owner: 3 };

export interface SessionUser {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  isPlatformAdmin: boolean;
  sessionId: string;
}

export interface Membership {
  clanId: string;
  userId: string;
  memberId: string;
  role: ClanRole;
  personId: string | null;
}

export interface AppRequest extends Request {
  user?: SessionUser;
  membership?: Membership;
}

export const IS_PUBLIC = "coinguon:isPublic";
export const MIN_ROLE = "coinguon:minRole";

/** Route không cần đăng nhập */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Vai trò tối thiểu trong dòng họ (route có tham số :clanId). Mặc định: member. */
export const MinRole = (role: ClanRole) => SetMetadata(MIN_ROLE, role);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionUser => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  return req.user!;
});

export const CurrentMembership = createParamDecorator((_: unknown, ctx: ExecutionContext): Membership => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  return req.membership!;
});
