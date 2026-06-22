import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";

import { ApiKeyGuard } from "./api-key.guard.js";
import {
  ConsoleAuthService,
  type ConsoleAuthResponse,
  type ConsoleAuthUser,
} from "./console-auth.service.js";
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
  ) {}

  @Post("login")
  login(@Body() body: ConsoleLoginDto): Promise<ConsoleAuthResponse> {
    return this.consoleAuth.login(body);
  }

  @Post("register")
  register(@Body() body: ConsoleRegisterDto): Promise<ConsoleAuthResponse> {
    return this.consoleAuth.register(body);
  }

  @Post("refresh")
  refresh(@Body() body: ConsoleRefreshDto): Promise<ConsoleAuthResponse> {
    return this.consoleAuth.refresh(body.refreshToken);
  }

  @Post("logout")
  logout(@Body() body: ConsoleRefreshDto): Promise<{ revoked: true }> {
    return this.consoleAuth.logout(body.refreshToken);
  }

  @Get("me")
  @UseGuards(ApiKeyGuard)
  me(@CurrentUser() user: RequestUser): ConsoleAuthUser {
    return this.consoleAuth.me(user);
  }
}
