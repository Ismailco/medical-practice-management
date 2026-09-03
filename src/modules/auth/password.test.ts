import { describe, expect, it } from "vitest";

import { hashPassword, readPasswordHashParameters, verifyPassword } from "./password";

describe("password hashing", () => {
  it("uses Argon2id with the configured parameters", async () => {
    const password = "correct horse battery staple";
    const hash = await hashPassword(password);

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword({ hash, password })).toBe(true);
    expect(await verifyPassword({ hash, password: "incorrect password" })).toBe(false);
    expect(readPasswordHashParameters(hash)).toMatchObject({
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
  });
});
