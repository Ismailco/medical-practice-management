import { z } from "zod";

import { isCalendarDate } from "@/modules/appointments/timezone";

const dueDate = z.string().refine(isCalendarDate, "Use a valid calendar date.");
const reason = z.string().trim().min(1).max(2_000);
const expectedVersion = z.number().int().min(1).max(2_147_483_647);

const commonCreationFields = { dueDate, reason } as const;

export const followUpCreationInputSchema = z.union([
  z.object({ patientId: z.string().uuid(), ...commonCreationFields }).strict(),
  z.object({ consultationId: z.string().uuid(), ...commonCreationFields }).strict(),
]);

export const followUpUpdateInputSchema = z.object({ expectedVersion, dueDate, reason }).strict();

export const followUpTransitionInputSchema = z.object({ expectedVersion }).strict();

export const followUpIdSchema = z.string().uuid();

export type FollowUpStatus = "PENDING" | "COMPLETED" | "CANCELLED";
