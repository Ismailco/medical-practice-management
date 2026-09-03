import "server-only";

import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";

import { env } from "@/config/env";
import { db } from "@/db/client";
import { authSchema, user } from "@/db/schema";
import {
  hashPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from "@/modules/auth/password";

const trustedProxies = env.AUTH_TRUSTED_PROXY_CIDRS.split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

export const auth = betterAuth({
  appName: "Clinic Management",
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: false,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    autoSignIn: false,
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
  },
  user: {
    additionalFields: {
      role: {
        type: ["DOCTOR", "SECRETARY"],
        required: true,
        defaultValue: "SECRETARY",
        input: false,
        returned: false,
      },
      active: {
        type: "boolean",
        required: true,
        defaultValue: true,
        input: false,
        returned: false,
      },
    },
  },
  session: {
    expiresIn: 8 * 60 * 60,
    updateAge: 30 * 60,
    freshAge: 30 * 60,
    cookieCache: { enabled: false },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 15 * 60, max: 20 },
    },
  },
  trustedOrigins: [env.APP_URL],
  advanced: {
    cookiePrefix: "clinic",
    useSecureCookies: new URL(env.APP_URL).protocol === "https:",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(env.APP_URL).protocol === "https:",
      path: "/",
    },
    database: {
      generateId: () => crypto.randomUUID(),
    },
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for"],
      ipv6Subnet: 64,
      ...(trustedProxies.length > 0 ? { trustedProxies } : {}),
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (sessionData) => {
          const [staffUser] = await db
            .select({ active: user.active })
            .from(user)
            .where(eq(user.id, sessionData.userId))
            .limit(1);

          if (!staffUser?.active) {
            throw new APIError("UNAUTHORIZED", { message: "Invalid credentials." });
          }

          return { data: sessionData };
        },
      },
    },
  },
  logger: { disabled: true },
  telemetry: { enabled: false },
});
