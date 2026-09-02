import { describe, expect, it } from "vitest";

import { parseEnvironment } from "./env.schema";

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://user:password@localhost:5432/database",
};

describe("parseEnvironment", () => {
  it("accepts a complete server environment", () => {
    expect(parseEnvironment(validEnvironment)).toEqual(validEnvironment);
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
});
