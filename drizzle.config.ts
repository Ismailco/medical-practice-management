import "dotenv/config";
import { defineConfig } from "drizzle-kit";

import { parseEnvironment } from "./src/config/env.schema";

const environment = parseEnvironment(process.env);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: environment.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
