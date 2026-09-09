import { z } from "zod";

import { isCalendarDate } from "@/modules/appointments/timezone";

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(maximum).nullable().optional(),
  );

const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().email().max(254).nullable().optional(),
);

const optionalLogoDataUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z
    .string()
    .max(1_500_000)
    .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/)
    .nullable()
    .optional(),
);

const itemShape = {
  medicationName: z.string().trim().min(1).max(200),
  dosage: optionalText(200),
  form: optionalText(100),
  frequency: optionalText(200),
  duration: optionalText(200),
  quantity: optionalText(100),
  route: optionalText(100),
  instructions: optionalText(1_000),
} as const;

export const prescriptionItemInputSchema = z.object(itemShape).strict();

export const prescriptionItemsSchema = z
  .array(prescriptionItemInputSchema)
  .max(50, "A prescription cannot contain more than 50 items.");

const dueConsultation = z.object({ consultationId: z.string().uuid() }).strict();
const duePatient = z.object({ patientId: z.string().uuid() }).strict();

export const prescriptionCreationInputSchema = z.union([duePatient, dueConsultation]);

export const prescriptionDraftSaveInputSchema = z
  .object({
    expectedVersion: z.number().int().min(1).max(2_147_483_647),
    consultationId: z.string().uuid().nullable(),
    items: prescriptionItemsSchema,
  })
  .strict();

export const prescriptionExpectedVersionSchema = z
  .object({ expectedVersion: z.number().int().min(1).max(2_147_483_647) })
  .strict();

export const prescriptionIdSchema = z.string().uuid();

export const practiceProfileInputSchema = z
  .object({
    clinic: z
      .object({
        name: z.string().trim().min(1).max(200),
        nameArabic: optionalText(200),
        address: optionalText(500),
        addressArabic: optionalText(500),
        city: optionalText(100),
        cityArabic: optionalText(100),
        phone: optionalText(50),
        phoneSecondary: optionalText(50),
        email: optionalEmail,
        logoDataUrl: optionalLogoDataUrl,
        expectedVersion: z.number().int().min(1).max(2_147_483_647).nullable(),
      })
      .strict(),
    doctor: z
      .object({
        displayName: z.string().trim().min(1).max(200),
        displayNameArabic: optionalText(200),
        specialty: optionalText(200),
        specialtyArabic: optionalText(200),
        professionalIdentifier: optionalText(200),
        socialMedia: optionalText(500),
        expectedVersion: z.number().int().min(1).max(2_147_483_647).nullable(),
      })
      .strict(),
  })
  .strict();

export function assertIssueDate(value: string): string {
  if (!isCalendarDate(value)) throw new Error("Invalid issue date.");
  return value;
}

export type PrescriptionItemInput = z.infer<typeof prescriptionItemInputSchema>;
export type PrescriptionStatus = "DRAFT" | "FINALIZED" | "VOID";
