import { z } from "zod";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/modules/auth/password";

export const normalizedEmailSchema = z
  .string()
  .trim()
  .max(254)
  .email()
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Password must contain at most ${PASSWORD_MAX_LENGTH} characters.`);

export const staffNameSchema = z.string().trim().min(2).max(100);

export const createSecretarySchema = z
  .object({
    name: staffNameSchema,
    email: normalizedEmailSchema,
    password: passwordSchema,
  })
  .strict();

export const updateSecretarySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("disable") }).strict(),
  z.object({ action: z.literal("enable") }).strict(),
  z.object({ action: z.literal("reset_password"), password: passwordSchema }).strict(),
]);
