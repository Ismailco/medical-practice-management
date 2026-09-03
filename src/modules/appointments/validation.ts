import { z } from "zod";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, "Use a valid date.");

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid time in HH:mm format.");

const reasonSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : ""))
  .pipe(z.string().max(160, "Administrative reason must be 160 characters or fewer."))
  .transform((value) => (value ? value : null));

const schedulingFields = {
  patientId: z.string().uuid(),
  localDate: dateSchema,
  localStartTime: timeSchema,
  durationMinutes: z.number().int().min(5).max(480),
  administrativeReason: reasonSchema,
  allowOverlap: z.boolean().default(false),
} as const;

export const appointmentCreateInputSchema = z.object(schedulingFields).strict();

export const appointmentRescheduleInputSchema = z
  .object({
    localDate: dateSchema,
    localStartTime: timeSchema,
    durationMinutes: z.number().int().min(5).max(480),
    administrativeReason: reasonSchema,
    allowOverlap: z.boolean().default(false),
    expectedVersion: z.number().int().min(1).max(2_147_483_647),
  })
  .strict();

export const appointmentTransitionInputSchema = z
  .object({
    targetStatus: z.enum([
      "SCHEDULED",
      "ARRIVED",
      "IN_CONSULTATION",
      "COMPLETED",
      "CANCELLED",
      "NO_SHOW",
    ]),
    expectedVersion: z.number().int().min(1).max(2_147_483_647),
  })
  .strict();

export const appointmentIdSchema = z.string().uuid();

export const agendaQuerySchema = z
  .object({
    date: dateSchema.optional(),
    status: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z
        .enum(["SCHEDULED", "ARRIVED", "IN_CONSULTATION", "COMPLETED", "CANCELLED", "NO_SHOW"])
        .optional(),
    ),
  })
  .strict();

export const appointmentHistoryQuerySchema = z
  .object({ page: z.coerce.number().int().min(1).max(10_000).default(1) })
  .strict();

export type AppointmentCreateInput = z.infer<typeof appointmentCreateInputSchema>;
export type AppointmentRescheduleInput = z.infer<typeof appointmentRescheduleInputSchema>;
export type AppointmentStatus = z.infer<typeof appointmentTransitionInputSchema>["targetStatus"];
