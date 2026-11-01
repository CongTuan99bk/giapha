import { emailSchema, idSchema } from "@coinguon/schemas";
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";
import { CurrentMembership, CurrentUser, type Membership, MinRole, Public, type SessionUser } from "../common/context.js";
import { Database } from "../db/database.js";
import { MembersService } from "./members.service.js";

const grantableRole = z.enum(["member", "editor", "admin"]);

const createInvitationSchema = z
  .object({
    role: grantableRole.default("member"),
    email: emailSchema.optional(),
    personId: idSchema.optional(),
    expiresInDays: z.number().int().min(1).max(30).default(7),
    maxUses: z.number().int().min(1).max(100).default(1),
  })
  .strict();

const updateMemberSchema = z
  .object({ role: grantableRole.optional(), personId: idSchema.nullable().optional() })
  .strict()
  .refine((v) => v.role !== undefined || v.personId !== undefined, { message: "Không có gì để cập nhật" });

/** FR-CLAN-02/03: thành viên, vai trò, lời mời — chỉ quản trị viên trở lên. */
@Controller("clans/:clanId")
export class MembersController {
  constructor(
    private readonly db: Database,
    private readonly members: MembersService,
  ) {}

  private ctx(m: Membership) {
    return { clanId: m.clanId, userId: m.userId };
  }

  @Get("members")
  @MinRole("admin")
  list(@CurrentMembership() m: Membership) {
    return this.db.withClan(this.ctx(m), (trx) => this.members.list(trx));
  }

  @Patch("members/:memberId")
  @MinRole("admin")
  update(@CurrentMembership() m: Membership, @Param("memberId") memberId: string, @Body() body: unknown) {
    const input = updateMemberSchema.parse(body);
    return this.db.withClan(this.ctx(m), (trx) => this.members.update(trx, m, idSchema.parse(memberId), input));
  }

  @Delete("members/:memberId")
  @MinRole("admin")
  @HttpCode(204)
  async remove(@CurrentMembership() m: Membership, @Param("memberId") memberId: string) {
    await this.db.withClan(this.ctx(m), (trx) => this.members.remove(trx, m, idSchema.parse(memberId)));
  }

  /** "Đây là tôi": thành viên tự gắn tài khoản với một người trong phả */
  @Patch("me/person")
  link(@CurrentMembership() m: Membership, @Body() body: unknown) {
    const { personId } = z.object({ personId: idSchema.nullable() }).strict().parse(body);
    return this.db.withClan(this.ctx(m), (trx) => this.members.update(trx, m, m.memberId, { personId }));
  }

  @Get("invitations")
  @MinRole("admin")
  invitations(@CurrentMembership() m: Membership) {
    return this.db.withClan(this.ctx(m), (trx) => this.members.listInvitations(trx));
  }

  @Post("invitations")
  @MinRole("admin")
  createInvitation(@CurrentMembership() m: Membership, @Body() body: unknown) {
    const input = createInvitationSchema.parse(body);
    return this.db.withClan(this.ctx(m), (trx) => this.members.createInvitation(trx, m, input));
  }

  @Delete("invitations/:invitationId")
  @MinRole("admin")
  @HttpCode(204)
  async revoke(@CurrentMembership() m: Membership, @Param("invitationId") id: string) {
    await this.db.withClan(this.ctx(m), (trx) => this.members.revokeInvitation(trx, m, idSchema.parse(id)));
  }
}

/** Nhận lời mời bằng mã trong link — người nhận chưa là thành viên nên không nằm dưới /clans/:clanId. */
@Controller("invitations")
export class InvitationsController {
  constructor(private readonly members: MembersService) {}

  @Public()
  @Get(":token")
  preview(@Param("token") token: string) {
    return this.members.preview(token);
  }

  @Post(":token/accept")
  @HttpCode(200)
  accept(@Param("token") token: string, @CurrentUser() user: SessionUser) {
    return this.members.accept(token, user);
  }
}
