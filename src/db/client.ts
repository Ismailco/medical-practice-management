import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/config/env";

type SqlClient = ReturnType<typeof postgres>;

declare global {
  var __clinicSqlClient: SqlClient | undefined;
}

const sqlClient =
  globalThis.__clinicSqlClient ??
  postgres(env.DATABASE_URL, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 10,
  });

if (env.NODE_ENV !== "production") {
  globalThis.__clinicSqlClient = sqlClient;
}

export const db = drizzle(sqlClient);

export async function checkDatabaseConnection(): Promise<void> {
  await sqlClient`select 1`;
}
