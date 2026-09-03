import { describe, expect, it } from "vitest";

import { assertDestructiveTestDatabaseAllowed } from "./database-reset-safety";

const validEnvironment = {
  NODE_ENV: "test",
  ALLOW_TEST_DATABASE_RESET: "true",
  DATABASE_URL: "postgresql://test_user:test_password@127.0.0.1:5432/clinic_integration_test",
} as const;

describe("destructive integration-test database safety", () => {
  it("accepts an explicitly authorized test database", () => {
    expect(() => assertDestructiveTestDatabaseAllowed(validEnvironment)).not.toThrow();
  });

  it("rejects a normal development database without exposing its connection string", () => {
    const databaseUrl = "postgresql://developer:private-password@127.0.0.1:5432/clinic_demo";

    expect(() =>
      assertDestructiveTestDatabaseAllowed({ ...validEnvironment, DATABASE_URL: databaseUrl }),
    ).toThrow(/test-specific database/);

    try {
      assertDestructiveTestDatabaseAllowed({ ...validEnvironment, DATABASE_URL: databaseUrl });
    } catch (error) {
      expect(String(error)).not.toContain("private-password");
      expect(String(error)).not.toContain(databaseUrl);
    }
  });

  it("rejects a missing explicit reset opt-in", () => {
    expect(() =>
      assertDestructiveTestDatabaseAllowed({
        ...validEnvironment,
        ALLOW_TEST_DATABASE_RESET: undefined,
      }),
    ).toThrow(/ALLOW_TEST_DATABASE_RESET=true/);
  });

  it("rejects a non-test NODE_ENV", () => {
    expect(() =>
      assertDestructiveTestDatabaseAllowed({ ...validEnvironment, NODE_ENV: "development" }),
    ).toThrow(/NODE_ENV must be exactly 'test'/);
  });

  it.each(["clinic", "postgres", "production_test", "clinic_live_test", "arbitrary"])(
    "rejects unsafe database name %s",
    (databaseName) => {
      expect(() =>
        assertDestructiveTestDatabaseAllowed({
          ...validEnvironment,
          DATABASE_URL: `postgresql://test_user:test_password@127.0.0.1:5432/${databaseName}`,
        }),
      ).toThrow(/test-specific database/);
    },
  );
});
