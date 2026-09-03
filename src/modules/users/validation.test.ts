import { describe, expect, it } from "vitest";

import { createSecretarySchema, normalizedEmailSchema, passwordSchema } from "./validation";

describe("staff input validation", () => {
  it("normalizes valid email identifiers", () => {
    expect(normalizedEmailSchema.parse(" Staff@Example.Test ")).toBe("staff@example.test");
  });

  it("rejects malformed identifiers and out-of-range passwords", () => {
    expect(normalizedEmailSchema.safeParse("not-an-email").success).toBe(false);
    expect(passwordSchema.safeParse("too short").success).toBe(false);
    expect(passwordSchema.safeParse("x".repeat(129)).success).toBe(false);
  });

  it("rejects caller-provided roles", () => {
    expect(
      createSecretarySchema.safeParse({
        name: "Synthetic Secretary",
        email: "secretary@example.test",
        password: "synthetic-password-long",
        role: "DOCTOR",
      }).success,
    ).toBe(false);
  });
});
