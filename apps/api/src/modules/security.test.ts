import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionCookieClearOptions, sessionCookieOptions, validateSecurityConfig } from "./security.js";

describe("security configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects weak session secrets in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "change-this-development-secret");
    vi.stubEnv("WEB_ORIGIN", "https://qms.example.com");

    expect(() => validateSecurityConfig()).toThrow("SESSION_SECRET");
  });

  it("rejects documented placeholder secrets in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "replace-with-at-least-32-random-characters-before-deploying");
    vi.stubEnv("WEB_ORIGIN", "https://qms.example.com");

    expect(() => validateSecurityConfig()).toThrow("SESSION_SECRET");
  });

  it("requires an HTTPS web origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "7bc5517f28c7213fbc7ad2fb1045cd8f");
    vi.stubEnv("WEB_ORIGIN", "http://qms.example.com");

    expect(() => validateSecurityConfig()).toThrow("WEB_ORIGIN");
  });

  it("uses secure cookies in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(sessionCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/"
    });
  });

  it("omits max age when clearing session cookies", () => {
    expect(sessionCookieClearOptions()).not.toHaveProperty("maxAge");
  });
});
