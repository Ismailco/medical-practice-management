import { z } from "zod";

const integerFromEnvironment = (minimum: number, maximum: number) =>
  z.coerce.number().int().min(minimum).max(maximum);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.string().refine((value) => {
      try {
        const url = new URL(value);
        return (
          (url.protocol === "http:" || url.protocol === "https:") && url.href === `${url.origin}/`
        );
      } catch {
        return false;
      }
    }, "APP_URL must be an http or https origin without a path, query, or fragment"),
    DATABASE_URL: z.string().refine((value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "postgres:" || protocol === "postgresql:";
      } catch {
        return false;
      }
    }, "DATABASE_URL must be a valid postgres or postgresql URL"),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must contain at least 32 characters")
      .refine(
        (value) => !/(change|replace|example|placeholder)/i.test(value),
        "BETTER_AUTH_SECRET must not be a documented placeholder",
      ),
    AUTH_ARGON2_MEMORY_KIB: integerFromEnvironment(19_456, 1_048_576).default(65_536),
    AUTH_ARGON2_TIME_COST: integerFromEnvironment(2, 10).default(3),
    AUTH_ARGON2_PARALLELISM: integerFromEnvironment(1, 16).default(1),
    AUTH_TRUSTED_PROXY_CIDRS: z.string().default(""),
    CLINIC_TIMEZONE: z.string().refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    }, "CLINIC_TIMEZONE must be a valid IANA timezone"),
    ALLOW_TEST_DATABASE_RESET: z.enum(["true", "false"]).default("false"),
    ALLOW_DEMO_SEED: z.enum(["true", "false"]).default("false"),
    ALLOW_DEMO_RESET: z.enum(["true", "false"]).default("false"),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && new URL(value.APP_URL).protocol !== "https:") {
      context.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "APP_URL must use https in production",
      });
    }
    if (value.NODE_ENV === "production" && value.ALLOW_TEST_DATABASE_RESET === "true") {
      context.addIssue({
        code: "custom",
        path: ["ALLOW_TEST_DATABASE_RESET"],
        message: "must be false in production",
      });
    }
    if (value.NODE_ENV === "production" && value.ALLOW_DEMO_SEED === "true") {
      context.addIssue({
        code: "custom",
        path: ["ALLOW_DEMO_SEED"],
        message: "must be false in production",
      });
    }
    if (value.NODE_ENV === "production" && value.ALLOW_DEMO_RESET === "true") {
      context.addIssue({
        code: "custom",
        path: ["ALLOW_DEMO_RESET"],
        message: "must be false in production",
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid server environment configuration: ${details}`);
  }

  return Object.freeze(result.data);
}
