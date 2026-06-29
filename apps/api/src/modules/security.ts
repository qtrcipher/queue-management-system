import type { INestApplication } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

export const SESSION_COOKIE_NAME = "qms_session";
export const SESSION_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 12;

const DEVELOPMENT_SESSION_SECRET = "development-secret";
const WEAK_SESSION_SECRETS = new Set([
  DEVELOPMENT_SESSION_SECRET,
  "change-this-development-secret",
  "replace-with-at-least-32-random-characters-before-deploying",
  "replace-with-at-least-32-random-bytes"
]);

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function sessionSecret() {
  return process.env.SESSION_SECRET ?? DEVELOPMENT_SESSION_SECRET;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction(),
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_MS
  };
}

export function sessionCookieClearOptions() {
  const { maxAge: _maxAge, ...options } = sessionCookieOptions();
  return options;
}

export function validateSecurityConfig() {
  if (!isProduction()) return;

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32 || WEAK_SESSION_SECRETS.has(secret) || secret.includes("replace-with")) {
    throw new Error("SESSION_SECRET must be set to a strong value in production.");
  }

  const webOrigin = process.env.WEB_ORIGIN;
  if (!webOrigin || !webOrigin.startsWith("https://")) {
    throw new Error("WEB_ORIGIN must be an HTTPS origin in production.");
  }
}

export function applyHttpSecurity(app: INestApplication) {
  const express = app.getHttpAdapter().getInstance() as {
    disable?: (setting: string) => void;
    set?: (setting: string, value: unknown) => void;
    use: (handler: SecurityMiddleware) => void;
  };
  express.disable?.("x-powered-by");
  if (process.env.TRUST_PROXY === "true") express.set?.("trust proxy", 1);
  express.use(securityHeaders);
  express.use(originProtection);
}

type SecurityMiddleware = (request: Request, response: Response, next: NextFunction) => void;

function securityHeaders(_request: Request, response: Response, next: NextFunction) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}

function originProtection(request: Request, response: Response, next: NextFunction) {
  if (!isUnsafeMethod(request.method)) {
    next();
    return;
  }

  const allowedOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
  const requestOrigin = request.header("origin") ?? refererOrigin(request.header("referer"));
  if (requestOrigin === allowedOrigin || (!requestOrigin && !isProduction())) {
    next();
    return;
  }

  response.status(403).json({ message: "Invalid request origin" });
}

function isUnsafeMethod(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function refererOrigin(referer: string | undefined) {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

export function clientIdentifier(request: Request) {
  const forwardedFor = process.env.TRUST_PROXY === "true" ? request.header("x-forwarded-for")?.split(",")[0]?.trim() : undefined;
  return forwardedFor || request.ip || request.socket.remoteAddress || "unknown";
}
