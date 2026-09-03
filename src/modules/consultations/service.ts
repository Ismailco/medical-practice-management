import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  appointment,
  auditLog,
  clinicalNoteAddendum,
  clinicalNoteRevision,
  consultation,
  patient,
} from "@/db/schema";
import { ConflictError, NotFoundError } from "@/modules/auth/errors";
import type { SafeUser } from "@/modules/auth/session";
import {
  appointmentConsultationInputSchema,
  clinicalAddendumInputSchema,
  clinicalRevisionInputSchema,
  directConsultationInputSchema,
  finalizeConsultationInputSchema,
} from "./validation";

export type ConsultationMutationResult = Readonly<{
  id: string;
  status: "IN_PROGRESS" | "FINALIZED";
  version: number;
  revisionNumber: number;
}>;

export async function startDirectConsultation(
  input: unknown,
  actor: SafeUser,
): Promise<ConsultationMutationResult> {
  const parsed = directConsultationInputSchema.parse(input);
  return db.transaction(async (transaction) => {
    const [patientRecord] = await transaction
      .select({ id: patient.id, archivedAt: patient.archivedAt })
      .from(patient)
      .where(eq(patient.id, parsed.patientId))
      .limit(1)
      .for("update");
    if (!patientRecord) throw new NotFoundError();
    if (patientRecord.archivedAt) {
      throw new ConflictError("Archived patients cannot receive new consultations.");
    }

    const [created] = await transaction
      .insert(consultation)
      .values({ patientId: patientRecord.id, doctorId: actor.id })
      .returning();
    if (!created) throw new Error("Consultation insert returned no record.");
    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: "CONSULTATION_CREATED",
      entityType: "consultation",
      entityId: created.id,
      metadata: { linkedToAppointment: false, status: created.status, version: created.version },
    });
    return {
      id: created.id,
      status: created.status,
      version: created.version,
      revisionNumber: created.revisionCount,
    };
  });
}

export async function startConsultationFromAppointment(
  input: unknown,
  actor: SafeUser,
): Promise<ConsultationMutationResult> {
  const parsed = appointmentConsultationInputSchema.parse(input);
  return db.transaction(async (transaction) => {
    const [appointmentIdentity] = await transaction
      .select({ patientId: appointment.patientId })
      .from(appointment)
      .where(eq(appointment.id, parsed.appointmentId))
      .limit(1);
    if (!appointmentIdentity) throw new NotFoundError();

    const [patientRecord] = await transaction
      .select({ id: patient.id, archivedAt: patient.archivedAt })
      .from(patient)
      .where(eq(patient.id, appointmentIdentity.patientId))
      .limit(1)
      .for("update");
    if (!patientRecord) throw new NotFoundError();
    if (patientRecord.archivedAt) {
      throw new ConflictError("Archived patients cannot receive new consultations.");
    }

    const [appointmentRecord] = await transaction
      .select()
      .from(appointment)
      .where(eq(appointment.id, parsed.appointmentId))
      .limit(1)
      .for("update");
    if (!appointmentRecord) throw new NotFoundError();
    if (appointmentRecord.patientId !== patientRecord.id) {
      throw new ConflictError("The appointment changed. Reload and try again.");
    }
    if (appointmentRecord.version !== parsed.expectedAppointmentVersion) {
      throw new ConflictError(
        "This appointment was changed by another user. Reload and try again.",
      );
    }
    if (appointmentRecord.status !== "ARRIVED") {
      throw new ConflictError("A consultation can start only from an arrived appointment.");
    }

    const [existing] = await transaction
      .select({ id: consultation.id })
      .from(consultation)
      .where(eq(consultation.appointmentId, appointmentRecord.id))
      .limit(1);
    if (existing) throw new ConflictError("This appointment already has a consultation.");

    const [created] = await transaction
      .insert(consultation)
      .values({
        patientId: patientRecord.id,
        appointmentId: appointmentRecord.id,
        doctorId: actor.id,
      })
      .returning();
    if (!created) throw new Error("Consultation insert returned no record.");

    const [updatedAppointment] = await transaction
      .update(appointment)
      .set({
        status: "IN_CONSULTATION",
        updatedAt: new Date(),
        version: sql`${appointment.version} + 1`,
      })
      .where(
        and(
          eq(appointment.id, appointmentRecord.id),
          eq(appointment.version, parsed.expectedAppointmentVersion),
          eq(appointment.status, "ARRIVED"),
        ),
      )
      .returning({ id: appointment.id, version: appointment.version });
    if (!updatedAppointment) {
      throw new ConflictError(
        "This appointment was changed by another user. Reload and try again.",
      );
    }

    await transaction.insert(auditLog).values([
      {
        actorUserId: actor.id,
        action: "CONSULTATION_CREATED",
        entityType: "consultation",
        entityId: created.id,
        metadata: { linkedToAppointment: true, status: created.status, version: created.version },
      },
      {
        actorUserId: actor.id,
        action: "APPOINTMENT_STATUS_CHANGED",
        entityType: "appointment",
        entityId: appointmentRecord.id,
        metadata: {
          oldStatus: "ARRIVED",
          newStatus: "IN_CONSULTATION",
          version: updatedAppointment.version,
        },
      },
    ]);
    return {
      id: created.id,
      status: created.status,
      version: created.version,
      revisionNumber: created.revisionCount,
    };
  });
}

export async function saveClinicalNoteRevision(
  consultationId: string,
  input: unknown,
  actor: SafeUser,
): Promise<ConsultationMutationResult> {
  const parsed = clinicalRevisionInputSchema.parse(input);
  return db.transaction(async (transaction) => {
    const [current] = await transaction
      .select()
      .from(consultation)
      .where(eq(consultation.id, consultationId))
      .limit(1)
      .for("update");
    if (!current) throw new NotFoundError();
    if (current.status !== "IN_PROGRESS") {
      throw new ConflictError("Finalized consultations cannot be edited. Add an addendum instead.");
    }
    if (current.version !== parsed.expectedVersion) {
      throw new ConflictError("This consultation was changed elsewhere. Reload before saving.");
    }

    const revisionNumber = current.revisionCount + 1;
    const [revision] = await transaction
      .insert(clinicalNoteRevision)
      .values({
        consultationId,
        revisionNumber,
        reasonForVisit: parsed.reasonForVisit,
        observations: parsed.observations,
        diagnosis: parsed.diagnosis,
        notes: parsed.notes,
        createdBy: actor.id,
      })
      .returning({ id: clinicalNoteRevision.id });
    if (!revision) throw new Error("Clinical revision insert returned no record.");

    const [updated] = await transaction
      .update(consultation)
      .set({
        revisionCount: revisionNumber,
        version: sql`${consultation.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(consultation.id, consultationId),
          eq(consultation.status, "IN_PROGRESS"),
          eq(consultation.version, parsed.expectedVersion),
        ),
      )
      .returning();
    if (!updated)
      throw new ConflictError("This consultation changed before the revision was saved.");

    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: "CLINICAL_NOTE_REVISION_CREATED",
      entityType: "consultation",
      entityId: consultationId,
      metadata: { revisionNumber, version: updated.version },
    });
    return {
      id: updated.id,
      status: updated.status,
      version: updated.version,
      revisionNumber,
    };
  });
}

export async function finalizeConsultation(
  consultationId: string,
  input: unknown,
  actor: SafeUser,
): Promise<ConsultationMutationResult> {
  const parsed = finalizeConsultationInputSchema.parse(input);
  return db.transaction(async (transaction) => {
    const [current] = await transaction
      .select()
      .from(consultation)
      .where(eq(consultation.id, consultationId))
      .limit(1)
      .for("update");
    if (!current) throw new NotFoundError();
    if (current.status !== "IN_PROGRESS")
      throw new ConflictError("This consultation is finalized.");
    if (current.version !== parsed.expectedVersion) {
      throw new ConflictError("This consultation was changed elsewhere. Reload before finalizing.");
    }
    if (current.revisionCount < 1) {
      throw new ConflictError("Save at least one clinical note revision before finalizing.");
    }

    const [finalRevision] = await transaction
      .select({ id: clinicalNoteRevision.id })
      .from(clinicalNoteRevision)
      .where(
        and(
          eq(clinicalNoteRevision.consultationId, consultationId),
          eq(clinicalNoteRevision.revisionNumber, current.revisionCount),
        ),
      )
      .orderBy(desc(clinicalNoteRevision.revisionNumber))
      .limit(1);
    if (!finalRevision) throw new ConflictError("The current clinical revision is unavailable.");

    const finalizedAt = new Date();
    const [updated] = await transaction
      .update(consultation)
      .set({
        status: "FINALIZED",
        finalRevisionId: finalRevision.id,
        finalizedAt,
        updatedAt: finalizedAt,
        version: sql`${consultation.version} + 1`,
      })
      .where(
        and(
          eq(consultation.id, consultationId),
          eq(consultation.status, "IN_PROGRESS"),
          eq(consultation.version, parsed.expectedVersion),
        ),
      )
      .returning();
    if (!updated) throw new ConflictError("This consultation changed before finalization.");

    if (current.appointmentId) {
      const [linkedAppointment] = await transaction
        .select()
        .from(appointment)
        .where(eq(appointment.id, current.appointmentId))
        .limit(1)
        .for("update");
      if (!linkedAppointment || linkedAppointment.status !== "IN_CONSULTATION") {
        throw new ConflictError("The linked appointment is not in consultation.");
      }
      const [completed] = await transaction
        .update(appointment)
        .set({
          status: "COMPLETED",
          updatedAt: finalizedAt,
          version: sql`${appointment.version} + 1`,
        })
        .where(
          and(
            eq(appointment.id, linkedAppointment.id),
            eq(appointment.version, linkedAppointment.version),
            eq(appointment.status, "IN_CONSULTATION"),
          ),
        )
        .returning({ version: appointment.version });
      if (!completed)
        throw new ConflictError("The linked appointment changed during finalization.");
      await transaction.insert(auditLog).values({
        actorUserId: actor.id,
        action: "APPOINTMENT_STATUS_CHANGED",
        entityType: "appointment",
        entityId: linkedAppointment.id,
        metadata: {
          oldStatus: "IN_CONSULTATION",
          newStatus: "COMPLETED",
          version: completed.version,
        },
      });
    }

    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: "CONSULTATION_FINALIZED",
      entityType: "consultation",
      entityId: consultationId,
      metadata: {
        status: updated.status,
        version: updated.version,
        revisionNumber: updated.revisionCount,
        linkedToAppointment: updated.appointmentId !== null,
      },
    });
    return {
      id: updated.id,
      status: updated.status,
      version: updated.version,
      revisionNumber: updated.revisionCount,
    };
  });
}

export async function addClinicalAddendum(
  consultationId: string,
  input: unknown,
  actor: SafeUser,
): Promise<Readonly<{ id: string; consultationId: string }>> {
  const parsed = clinicalAddendumInputSchema.parse(input);
  return db.transaction(async (transaction) => {
    const [current] = await transaction
      .select({ id: consultation.id, status: consultation.status })
      .from(consultation)
      .where(eq(consultation.id, consultationId))
      .limit(1)
      .for("update");
    if (!current) throw new NotFoundError();
    if (current.status !== "FINALIZED") {
      throw new ConflictError("Addenda can be added only after consultation finalization.");
    }
    const [created] = await transaction
      .insert(clinicalNoteAddendum)
      .values({ consultationId, content: parsed.content, createdBy: actor.id })
      .returning({ id: clinicalNoteAddendum.id });
    if (!created) throw new Error("Clinical addendum insert returned no record.");
    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: "CLINICAL_ADDENDUM_CREATED",
      entityType: "consultation",
      entityId: consultationId,
      metadata: { status: "FINALIZED" },
    });
    return { id: created.id, consultationId };
  });
}
