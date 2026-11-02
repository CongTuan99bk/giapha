import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { emailSchema, loginIdSchema, phoneSchema } from "@coinguon/schemas";
import type { CookieOptions, Response } from "express";
import { z } from "zod";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { type AppRequest, CurrentUser, Public, type SessionUser } from "../common/context.js";
import { CSRF_COOKIE, SESSION_COOKIE } from "../common/guards.js";
import { RateLimit } from "../common/rate-limit.js";
import { AuthService, type IssuedSession } from "./auth.service.js";
import { PasswordResetService } from "./password-reset.service.js";

/** Chuỗi rỗng từ form = không nhập */
const optional = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), s.optional());

const registerSchema = z
  .object({
    email: optional(emailSchema),
    phone: optional(phoneSchema),
    password: z.string().min(8, { message: "Mật khẩu tối thiểu 8 ký tự" }).max(200),
    name: z.string().trim().min(1, { message: "Nhập họ và tên" }).max(120),
  })
  .refine((v) => v.email || v.phone, { message: "Nhập số điện thoại hoặc email", path: ["phone"] });

const passwordSchema = z.string().min(8, { message: "Mật khẩu tối thiểu 8 ký tự" }).max(200);
const forgotSchema = z.object({ email: emailSchema });
const resetSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, { message: "Link không hợp lệ" }), password: passwordSchema });

/** `identifier`: email hoặc số điện thoại. Vẫn nhận trường `email` cũ (ứng dụng phiên bản trước). */
const loginSchema = z
  .object({ identifier: z.string().optional(), email: z.string().optional(), password: z.string().min(1).max(200) })
  .transform((v, ctx) => {
    const id = loginIdSchema.safeParse(v.identifier ?? v.email ?? "");
    if (!id.success) {
      for (const issue of id.error.issues) ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue.message, path: ["identifier"] });
      return z.NEVER;
    }
    return { loginId: id.data, password: v.password };
  });

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly resets: PasswordResetService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @RateLimit("register", { limit: 10, windowSec: 3600 })
  @Post("register")
  async register(@Body() body: unknown, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const input = registerSchema.parse(body);
    const { user, session } = await this.auth.register(input, req.header("user-agent"));
    this.setCookies(res, session);
    return { user, csrfToken: session.csrf };
  }

  @Public()
  @RateLimit("login", { limit: 30, windowSec: 900, bodyField: ["identifier", "email"], fieldLimit: 15 })
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const { loginId, password } = loginSchema.parse(body);
    const { user, session } = await this.auth.login(loginId, password, req.header("user-agent"));
    this.setCookies(res, session);
    return { user, csrfToken: session.csrf };
  }

  /** Luôn trả 202 dù email có hay không có tài khoản (không cho dò email). */
  @Public()
  @RateLimit("forgot", { limit: 5, windowSec: 3600, bodyField: "email", fieldLimit: 3 })
  @Post("forgot-password")
  @HttpCode(202)
  async forgot(@Body() body: unknown) {
    const { email } = forgotSchema.parse(body);
    await this.resets.requestByEmail(email);
    return { ok: true };
  }

  @Public()
  @RateLimit("reset", { limit: 10, windowSec: 900 })
  @Post("reset-password")
  @HttpCode(200)
  async reset(@Body() body: unknown) {
    const { token, password } = resetSchema.parse(body);
    return this.resets.reset(token, password);
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
    return { id: user.id, email: user.email, phone: user.phone, name: user.name, isPlatformAdmin: user.isPlatformAdmin };
  }
}
