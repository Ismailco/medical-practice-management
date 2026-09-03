import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

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
