import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";

import { ApiKeyGuard } from "./api-key.guard.js";
import {
  ConsoleAuthService,
  type ConsoleAuthResponse,
  type ConsoleAuthUser,
} from "./console-auth.service.js";
import { ConsoleCookieService } from "./console-cookie.service.js";
import type { RequestUser } from "./auth.types.js";
import { CurrentUser } from "./current-user.decorator.js";
import { ConsoleLoginDto } from "./dto/console-login.dto.js";
import { ConsoleRegisterDto } from "./dto/console-register.dto.js";
import { ConsoleRefreshDto } from "./dto/console-refresh.dto.js";

@Controller("auth/console")
export class ConsoleAuthController {
  constructor(
    @Inject(ConsoleAuthService)
    private readonly consoleAuth: ConsoleAuthService,
    @Inject(ConsoleCookieService)
    private readonly cookies: ConsoleCookieService,
  ) {}

  @Post("login")
  async login(
    @Body() body: ConsoleLoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ConsoleAuthResponse> {
    const session = await this.consoleAuth.login(body);
    const csrfToken = this.cookies.setAuthCookies(
      response,
      session.refreshToken,
      session.refreshTokenExpiresAt,
    );
    return { ...session, csrfToken };
  }

  @Post("register")
  async register(
    @Body() body: ConsoleRegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ConsoleAuthResponse> {
    const session = await this.consoleAuth.register(body);
    const csrfToken = this.cookies.setAuthCookies(
      response,
      session.refreshToken,
      session.refreshTokenExpiresAt,
    );
    return { ...session, csrfToken };
  }

  @Post("refresh")
  async refresh(
    @Body() body: ConsoleRefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ConsoleAuthResponse> {
    this.cookies.assertCsrf(request);
    const refreshToken = this.cookies.refreshTokenFromRequest(request, body.refreshToken);
    const session = await this.consoleAuth.refresh(refreshToken);
    const csrfToken = this.cookies.setAuthCookies(
      response,
      session.refreshToken,
      session.refreshTokenExpiresAt,
    );
    return { ...session, csrfToken };
  }

  @Post("logout")
  async logout(
    @Body() body: ConsoleRefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ revoked: true }> {
    this.cookies.assertCsrf(request);
    const refreshToken = this.cookies.refreshTokenFromRequest(request, body.refreshToken);
    const result = await this.consoleAuth.logout(refreshToken);
    this.cookies.clearAuthCookies(response);
    return result;
  }

  @Get("me")
  @UseGuards(ApiKeyGuard)
  me(@CurrentUser() user: RequestUser): ConsoleAuthUser {
    return this.consoleAuth.me(user);
  }
}
