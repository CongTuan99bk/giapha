import { idSchema } from "@coinguon/schemas";
import { Body, Controller, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { CurrentMembership, CurrentUser, type Membership, MinRole, type SessionUser } from "../common/context.js";
import { RateLimit } from "../common/rate-limit.js";
import { Database } from "../db/database.js";
import { AccountService, changePasswordSchema, memberAccountSchema, selfAccountSchema } from "./account.service.js";

/** Tài khoản của tôi: họ tên, email, số điện thoại, mật khẩu */
@Controller("me")
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Patch("account")
  @RateLimit("account", { limit: 20, windowSec: 900 })
  update(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    return this.account.updateSelf(user.id, selfAccountSchema.parse(body));
  }

  @Post("password")
  @HttpCode(204)
  // mỗi lần đoán sai mật khẩu hiện tại đều tốn một lượt
  @RateLimit("account", { limit: 20, windowSec: 900 })
  async password(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    await this.account.changePassword(user.id, user.sessionId, changePasswordSchema.parse(body));
  }
}

/** Quản trị sửa tài khoản thành viên có vai trò thấp hơn (đổi vai trò vẫn ở PATCH members/:id) */
@Controller("clans/:clanId/members")
export class MemberAccountController {
  constructor(
    private readonly db: Database,
    private readonly account: AccountService,
  ) {}

  @Patch(":memberId/account")
  @MinRole("admin")
  update(@CurrentMembership() m: Membership, @Param("memberId") id: string, @Body() body: unknown) {
    const input = memberAccountSchema.parse(body);
    return this.db.withClan({ clanId: m.clanId, userId: m.userId }, (trx) => this.account.updateMember(trx, m, idSchema.parse(id), input));
  }
}
