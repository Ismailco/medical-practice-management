import "server-only";

import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLog, patient } from "@/db/schema";
import { ConflictError, NotFoundError } from "@/modules/auth/errors";
import { toAdministrativePatient, type AdministrativePatient } from "./dto";
import {
  normalizePhone,
  patientAdministrativeInputSchema,
  patientLifecycleInputSchema,
  patientUpdateInputSchema,
  type PatientAdministrativeInput,
} from "./validation";

const mutableFields = [
  "firstName",
  "lastName",
  "dateOfBirth",
  "phone",
  "email",
  "address",
  "emergencyContactName",
  "emergencyContactPhone",
] as const;

function valuesForWrite(input: PatientAdministrativeInput) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    dateOfBirth: input.dateOfBirth,
    phone: input.phone,
    phoneNormalized: normalizePhone(input.phone),
    email: input.email,
    address: input.address,
    emergencyContactName: input.emergencyContactName,
    emergencyContactPhone: input.emergencyContactPhone,
  };
}

export async function createPatient(
  input: unknown,
  actorUserId: string,
): Promise<AdministrativePatient> {
  const parsed = patientAdministrativeInputSchema.parse(input);

  return db.transaction(async (transaction) => {
    const [created] = await transaction.insert(patient).values(valuesForWrite(parsed)).returning();
    if (!created) throw new Error("Patient insert returned no record.");

    await transaction.insert(auditLog).values({
      actorUserId,
      action: "PATIENT_CREATED",
      entityType: "patient",
      entityId: created.id,
      metadata: { version: created.version },
    });

    return toAdministrativePatient(created);
  });
}

export async function updatePatientAdministrativeData(
  patientId: string,
  input: unknown,
  actorUserId: string,
): Promise<AdministrativePatient> {
  const parsed = patientUpdateInputSchema.parse(input);
  const values = valuesForWrite(parsed);

  return db.transaction(async (transaction) => {
    const [current] = await transaction
      .select()
      .from(patient)
      .where(eq(patient.id, patientId))
      .limit(1);

    if (!current) throw new NotFoundError();
    if (current.archivedAt) {
      throw new ConflictError("Restore this patient before editing the record.");
    }
    if (current.version !== parsed.expectedVersion) {
      throw new ConflictError("This patient was changed by another user. Reload and try again.");
    }

    const changedFields = mutableFields.filter((field) => current[field] !== values[field]);
    if (changedFields.length === 0) return toAdministrativePatient(current);

    const [updated] = await transaction
      .update(patient)
      .set({ ...values, updatedAt: new Date(), version: sql`${patient.version} + 1` })
      .where(
        and(
          eq(patient.id, patientId),
          eq(patient.version, parsed.expectedVersion),
          isNull(patient.archivedAt),
        ),
      )
      .returning();

    if (!updated) {
      throw new ConflictError("This patient was changed by another user. Reload and try again.");
    }

    await transaction.insert(auditLog).values({
      actorUserId,
      action: "PATIENT_ADMIN_UPDATED",
      entityType: "patient",
      entityId: updated.id,
      metadata: { changedFields, version: updated.version },
    });

    return toAdministrativePatient(updated);
  });
}

export async function changePatientArchiveState(
  patientId: string,
  input: unknown,
  actorUserId: string,
): Promise<AdministrativePatient> {
  const parsed = patientLifecycleInputSchema.parse(input);
  const archive = parsed.action === "archive";

  return db.transaction(async (transaction) => {
    const expectedState = archive ? isNull(patient.archivedAt) : isNotNull(patient.archivedAt);
    const [updated] = await transaction
      .update(patient)
      .set({
        archivedAt: archive ? new Date() : null,
        archivedBy: archive ? actorUserId : null,
        updatedAt: new Date(),
        version: sql`${patient.version} + 1`,
      })
      .where(
        and(eq(patient.id, patientId), eq(patient.version, parsed.expectedVersion), expectedState),
      )
      .returning();

    if (!updated) {
      const [existing] = await transaction
        .select({ id: patient.id })
        .from(patient)
        .where(eq(patient.id, patientId))
        .limit(1);
      if (!existing) throw new NotFoundError();
      throw new ConflictError("This patient changed or is already in the requested state.");
    }

    await transaction.insert(auditLog).values({
      actorUserId,
      action: archive ? "PATIENT_ARCHIVED" : "PATIENT_RESTORED",
      entityType: "patient",
      entityId: updated.id,
      metadata: { archived: archive, version: updated.version },
    });

    return toAdministrativePatient(updated);
  });
}
