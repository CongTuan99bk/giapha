import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { emailSchema } from "@coinguon/schemas";
import type { CookieOptions, Response } from "express";
import { z } from "zod";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { type AppRequest, CurrentUser, Public, type SessionUser } from "../common/context.js";
import { CSRF_COOKIE, SESSION_COOKIE } from "../common/guards.js";
import { AuthService, type IssuedSession } from "./auth.service.js";

const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, { message: "Mật khẩu tối thiểu 8 ký tự" }).max(200),
  name: z.string().trim().min(1).max(120),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post("register")
  async register(@Body() body: unknown, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const input = registerSchema.parse(body);
    const { user, session } = await this.auth.register(input, req.header("user-agent"));
    this.setCookies(res, session);
    return { user, csrfToken: session.csrf };
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const { email, password } = loginSchema.parse(body);
    const { user, session } = await this.auth.login(email, password, req.header("user-agent"));
    this.setCookies(res, session);
    return { user, csrfToken: session.csrf };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@CurrentUser() user: SessionUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.sessionId);
    const opts = this.cookieOptions();
    res.clearCookie(SESSION_COOKIE, opts);
    res.clearCookie(CSRF_COOKIE, { ...opts, httpOnly: false });
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: "lax",
      path: "/",
      ...(this.config.COOKIE_DOMAIN ? { domain: this.config.COOKIE_DOMAIN } : {}),
    };
  }

  private setCookies(res: Response, s: IssuedSession) {
    const opts = { ...this.cookieOptions(), expires: s.expiresAt };
    res.cookie(SESSION_COOKIE, s.token, opts);
    // cookie CSRF đọc được bằng JavaScript để gửi lại qua header X-CSRF-Token
    res.cookie(CSRF_COOKIE, s.csrf, { ...opts, httpOnly: false });
  }
}

@Controller("me")
export class MeController {
  @Get()
  me(@CurrentUser() user: SessionUser) {
    return { id: user.id, email: user.email, name: user.name, isPlatformAdmin: user.isPlatformAdmin };
  }
}
