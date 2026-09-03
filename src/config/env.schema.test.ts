import { describe, expect, it } from "vitest";

import { parseEnvironment } from "./env.schema";

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://user:password@localhost:5432/database",
  BETTER_AUTH_SECRET: "unit-test-only-secret-value-at-least-32-characters",
};

describe("parseEnvironment", () => {
  it("accepts a complete server environment", () => {
    expect(parseEnvironment(validEnvironment)).toEqual({
      ...validEnvironment,
      AUTH_ARGON2_MEMORY_KIB: 65536,
      AUTH_ARGON2_TIME_COST: 3,
      AUTH_ARGON2_PARALLELISM: 1,
      AUTH_TRUSTED_PROXY_CIDRS: "",
    });
  });

  it("rejects a missing database URL with a clear error", () => {
    const invalidEnvironment = { ...validEnvironment };
    delete invalidEnvironment.DATABASE_URL;

    expect(() => parseEnvironment(invalidEnvironment)).toThrow(
      /Invalid server environment configuration: DATABASE_URL/,
    );
  });

  it("rejects non-PostgreSQL database URLs", () => {
    expect(() =>
      parseEnvironment({ ...validEnvironment, DATABASE_URL: "mysql://localhost/database" }),
    ).toThrow(/DATABASE_URL must be a valid postgres or postgresql URL/);
  });

  it("does not include an invalid configuration value in the error", () => {
    const invalidValue = "secret-value-that-must-not-be-logged";

    expect(() =>
      parseEnvironment({ ...validEnvironment, DATABASE_URL: invalidValue }),
    ).toThrowError(
      expect.objectContaining({
        message: expect.not.stringContaining(invalidValue),
      }),
    );
  });

  it("rejects a documented authentication secret placeholder", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        BETTER_AUTH_SECRET: "replace-with-a-secure-random-secret-value",
      }),
    ).toThrow(/BETTER_AUTH_SECRET must not be a documented placeholder/);
  });

  it("requires an origin-only URL and HTTPS in production", () => {
    expect(() =>
      parseEnvironment({ ...validEnvironment, APP_URL: "https://clinic.test/subpath" }),
    ).toThrow(/without a path/);
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        APP_URL: "http://clinic.test",
      }),
    ).toThrow(/must use https in production/);
  });
});
