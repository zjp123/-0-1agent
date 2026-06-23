import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import crypto from "node:crypto";
import type { Request, Response } from "express";

const REFRESH_COOKIE = "__Host-enterprise_agent_refresh";
const CSRF_COOKIE = "enterprise_agent_csrf";
const CSRF_HEADER = "x-csrf-token";

@Injectable()
export class ConsoleCookieService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  setAuthCookies(response: Response, refreshToken: string, refreshTokenExpiresAt: string): string {
    const csrfToken = crypto.randomBytes(32).toString("base64url");
    const expires = new Date(refreshTokenExpiresAt);
    response.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: this.secure,
      sameSite: this.sameSite,
      path: "/",
      expires,
    });
    response.cookie(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      secure: this.secure,
      sameSite: this.sameSite,
      path: "/",
      expires,
    });
    return csrfToken;
  }

  clearAuthCookies(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, {
      secure: this.secure,
      sameSite: this.sameSite,
      path: "/",
    });
    response.clearCookie(CSRF_COOKIE, {
      secure: this.secure,
      sameSite: this.sameSite,
      path: "/",
    });
  }

  refreshTokenFromRequest(request: Request, fallback?: string): string {
    return fallback ?? this.readCookie(request, REFRESH_COOKIE) ?? "";
  }

  assertCsrf(request: Request): void {
    const cookieToken = this.readCookie(request, CSRF_COOKIE);
    const headerToken = request.header(CSRF_HEADER);
    if (!cookieToken || !headerToken || !this.constantTimeEquals(cookieToken, headerToken)) {
      throw new UnauthorizedException("Invalid CSRF token");
    }
  }

  private get secure(): boolean {
    return this.config.get<boolean>("app.auth.cookieSecure", false);
  }

  private get sameSite(): "lax" | "strict" | "none" {
    return this.config.get<"lax" | "strict" | "none">("app.auth.cookieSameSite", "lax");
  }

  private readCookie(request: Request, name: string): string | undefined {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) {
      return undefined;
    }
    for (const part of cookieHeader.split(";")) {
      const [rawKey, ...rawValue] = part.trim().split("=");
      if (rawKey === name) {
        return decodeURIComponent(rawValue.join("="));
      }
    }
    return undefined;
  }

  private constantTimeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      crypto.timingSafeEqual(leftBuffer, rightBuffer)
    );
  }
}
