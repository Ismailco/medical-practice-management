type DestructiveTestDatabaseEnvironment = Readonly<{
  NODE_ENV?: string | undefined;
  ALLOW_TEST_DATABASE_RESET?: string | undefined;
  DATABASE_URL?: string | undefined;
}>;

const unsafeDatabaseNamePattern = /(?:^|[_-])(prod(?:uction)?|live|staging|demo)(?:[_-]|$)/i;
const testDatabaseNamePattern = /^[a-z][a-z0-9_-]*_test$/i;

function readDatabaseName(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null;

  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return null;

    const encodedName = parsed.pathname.slice(1);
    if (!encodedName || encodedName.includes("/")) return null;

    const databaseName = decodeURIComponent(encodedName);
    return databaseName.includes("/") ? null : databaseName;
  } catch {
    return null;
  }
}

export function assertDestructiveTestDatabaseAllowed(
  environment: DestructiveTestDatabaseEnvironment,
): void {
  if (environment.NODE_ENV !== "test") {
    throw new Error("Database reset refused: NODE_ENV must be exactly 'test'.");
  }

  if (environment.ALLOW_TEST_DATABASE_RESET !== "true") {
    throw new Error(
      "Database reset refused: set ALLOW_TEST_DATABASE_RESET=true explicitly for this command.",
    );
  }

  const databaseName = readDatabaseName(environment.DATABASE_URL);
  if (
    !databaseName ||
    !testDatabaseNamePattern.test(databaseName) ||
    unsafeDatabaseNamePattern.test(databaseName) ||
    databaseName.toLowerCase() === "postgres"
  ) {
    throw new Error(
      "Database reset refused: DATABASE_URL must select a clearly test-specific database ending in '_test'.",
    );
  }
}
