import { z } from "zod";

const NAME_MAX_LENGTH = 100;
const PHONE_MAX_LENGTH = 32;
const ADDRESS_MAX_LENGTH = 500;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isNotFutureDate(value: string): boolean {
  return value <= new Date().toISOString().slice(0, 10);
}

const optionalText = (maximum: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" ? value.trim() : ""))
    .pipe(z.string().max(maximum))
    .transform((value) => (value.length > 0 ? value : null));

const requiredName = z
  .string()
  .transform(normalizeWhitespace)
  .pipe(z.string().min(1).max(NAME_MAX_LENGTH));

const optionalName = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" ? normalizeWhitespace(value) : ""))
  .pipe(z.string().max(NAME_MAX_LENGTH))
  .transform((value) => (value.length > 0 ? value : null));

const optionalPhone = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" ? normalizeWhitespace(value) : ""))
  .pipe(
    z
      .string()
      .max(PHONE_MAX_LENGTH)
      .refine(
        (value) => value.length === 0 || /^\+?[0-9().\-\s]+$/.test(value),
        "Use digits and common telephone punctuation only.",
      )
      .refine((value) => {
        const digitCount = value.replace(/\D/g, "").length;
        return value.length === 0 || (digitCount >= 5 && digitCount <= 20);
      }, "Phone numbers must contain between 5 and 20 digits."),
  )
  .transform((value) => (value.length > 0 ? value : null));

const optionalEmail = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" ? value.trim() : ""))
  .pipe(z.union([z.literal(""), z.string().max(254).email()]))
  .transform((value) => (value.length > 0 ? value.toLowerCase() : null));

export const patientAdministrativeInputSchema = z
  .object({
    firstName: requiredName,
    lastName: requiredName,
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid calendar date.")
      .refine(isCalendarDate, "Use a valid calendar date.")
      .refine(isNotFutureDate, "Date of birth cannot be in the future."),
    phone: optionalPhone,
    email: optionalEmail,
    address: optionalText(ADDRESS_MAX_LENGTH),
    emergencyContactName: optionalName,
    emergencyContactPhone: optionalPhone,
  })
  .strict();

export const patientUpdateInputSchema = patientAdministrativeInputSchema
  .extend({ expectedVersion: z.number().int().min(1).max(2_147_483_647) })
  .strict();

export const patientLifecycleInputSchema = z
  .object({
    action: z.enum(["archive", "restore"]),
    expectedVersion: z.number().int().min(1).max(2_147_483_647),
  })
  .strict();

export const patientIdSchema = z.string().uuid();

export const patientListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    includeArchived: z
      .enum(["0", "1"])
      .default("0")
      .transform((value) => value === "1"),
  })
  .strict();

export const patientSearchInputSchema = z
  .object({
    q: z.string().trim().max(100).default(""),
    page: z.number().int().min(1).max(10_000).default(1),
    includeArchived: z.boolean().default(false),
  })
  .strict();

export type PatientAdministrativeInput = z.infer<typeof patientAdministrativeInputSchema>;
export type PatientUpdateInput = z.infer<typeof patientUpdateInputSchema>;
export type PatientSearchInput = z.infer<typeof patientSearchInputSchema>;

export function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return `${phone.startsWith("+") ? "+" : ""}${digits}`;
}
