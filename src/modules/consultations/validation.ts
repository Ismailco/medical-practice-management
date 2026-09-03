import { z } from "zod";

const optionalClinicalText = (maximum: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" ? value.trim() : ""))
    .pipe(z.string().max(maximum))
    .transform((value) => (value.length > 0 ? value : null));

export const directConsultationInputSchema = z.object({ patientId: z.string().uuid() }).strict();

export const appointmentConsultationInputSchema = z
  .object({
    appointmentId: z.string().uuid(),
    expectedAppointmentVersion: z.number().int().min(1).max(2_147_483_647),
  })
  .strict();

export const clinicalRevisionInputSchema = z
  .object({
    expectedVersion: z.number().int().min(1).max(2_147_483_647),
    reasonForVisit: optionalClinicalText(2_000),
    observations: optionalClinicalText(10_000),
    diagnosis: optionalClinicalText(4_000),
    notes: optionalClinicalText(20_000),
  })
  .strict()
  .refine(
    (value) =>
      value.reasonForVisit !== null ||
      value.observations !== null ||
      value.diagnosis !== null ||
      value.notes !== null,
    { message: "Enter at least one clinical note field." },
  );

export const finalizeConsultationInputSchema = z
  .object({ expectedVersion: z.number().int().min(1).max(2_147_483_647) })
  .strict();

export const clinicalAddendumInputSchema = z
  .object({ content: z.string().trim().min(1).max(20_000) })
  .strict();

export const consultationIdSchema = z.string().uuid();

export type ClinicalRevisionInput = z.infer<typeof clinicalRevisionInputSchema>;
