import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy, requiresPrivateNoStore } from "./proxy";

describe("content security policy", () => {
  it.each(["/login", "/dashboard"])("applies a nonce-based CSP to %s", (path) => {
    const response = proxy(new NextRequest(`https://clinic.test${path}`));
    const policy = response.headers.get("content-security-policy");

    expect(policy).toContain("default-src 'self'");
    expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("'unsafe-inline'");
  });
});

describe("sensitive route caching", () => {
  it.each([
    "/dashboard",
    "/patients/10000000-0000-4000-8000-000000000001",
    "/consultations",
    "/follow-ups",
    "/api/follow-ups/10000000-0000-4000-8000-000000000001",
    "/prescriptions",
    "/api/prescriptions/10000000-0000-4000-8000-000000000001",
    "/settings/practice",
  ])("forces private no-store caching for %s", (path) => {
    expect(requiresPrivateNoStore(path)).toBe(true);
    const response = proxy(new NextRequest(`https://clinic.test${path}`));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it("does not classify public liveness as sensitive", () => {
    expect(requiresPrivateNoStore("/api/health/live")).toBe(false);
  });
});
