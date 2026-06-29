import { HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import type { User } from "@prisma/client";
import { verify } from "argon2";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE_MAX_AGE_MS, sessionSecret } from "../security.js";
import { PrismaService } from "./prisma.service.js";

const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

type LoginAttempt = {
  failures: number;
  resetAt: number;
};

@Injectable()
export class AuthService {
  private readonly loginAttempts = new Map<string, LoginAttempt>();

  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string, clientId = "unknown") {
    const attemptKey = this.loginAttemptKey(email, clientId);
    this.assertLoginAllowed(attemptKey);

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await verify(user.passwordHash, password))) {
      this.recordLoginFailure(attemptKey);
      throw new UnauthorizedException("Invalid email or password");
    }

    this.loginAttempts.delete(attemptKey);
    const expiresAt = Date.now() + SESSION_COOKIE_MAX_AGE_MS;
    const token = this.sign(`${user.id}.${expiresAt}.${randomBytes(16).toString("hex")}`);
    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    };
  }

  async verifySessionToken(token: string | undefined): Promise<Omit<User, "passwordHash">> {
    if (!token) throw new UnauthorizedException("Missing session");

    const parts = token.split(".");
    if (parts.length !== 4) throw new UnauthorizedException("Invalid session");

    const [userId, expiresAtValue, nonce, signature] = parts;
    if (!userId || !expiresAtValue || !nonce || !signature) throw new UnauthorizedException("Invalid session");
    const expiresAt = Number(expiresAtValue);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) throw new UnauthorizedException("Session expired");

    const value = `${userId}.${expiresAtValue}.${nonce}`;
    const expected = this.signature(value);
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
      throw new UnauthorizedException("Invalid session");
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("Invalid session");

    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }

  private sign(value: string) {
    const signature = this.signature(value);
    return `${value}.${signature}`;
  }

  private signature(value: string) {
    return createHmac("sha256", sessionSecret()).update(value).digest("hex");
  }

  private loginAttemptKey(email: string, clientId: string) {
    return `${email.trim().toLowerCase()}:${clientId}`;
  }

  private assertLoginAllowed(key: string) {
    const attempt = this.loginAttempts.get(key);
    if (!attempt) return;

    if (Date.now() >= attempt.resetAt) {
      this.loginAttempts.delete(key);
      return;
    }

    if (attempt.failures >= MAX_LOGIN_FAILURES) {
      throw new HttpException("Too many failed login attempts. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private recordLoginFailure(key: string) {
    const now = Date.now();
    const existing = this.loginAttempts.get(key);
    const attempt = existing && now < existing.resetAt
      ? { failures: existing.failures + 1, resetAt: existing.resetAt }
      : { failures: 1, resetAt: now + LOGIN_WINDOW_MS };
    this.loginAttempts.set(key, attempt);
  }
}
