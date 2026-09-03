import "server-only";

import { and, count, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { appointment, auditLog, patient } from "@/db/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "@/modules/auth/errors";
import type { SafeUser } from "@/modules/auth/session";
import { toAppointmentDto, type AppointmentDto } from "./dto";
import { AppointmentOverlapError } from "./errors";
import { canRoleTransition } from "./lifecycle";
import { localDateTimeToInstant } from "./timezone";
import {
  appointmentCreateInputSchema,
  appointmentRescheduleInputSchema,
  appointmentTransitionInputSchema,
  type AppointmentCreateInput,
  type AppointmentStatus,
} from "./validation";

const overlapStatuses: AppointmentStatus[] = ["SCHEDULED", "ARRIVED", "IN_CONSULTATION"];

function schedule(
  input: Pick<AppointmentCreateInput, "localDate" | "localStartTime" | "durationMinutes">,
) {
  const scheduledStart = localDateTimeToInstant(input.localDate, input.localStartTime);
  const scheduledEnd = new Date(scheduledStart.getTime() + input.durationMinutes * 60_000);
  return { scheduledStart, scheduledEnd };
}

async function countOverlaps(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  scheduledStart: Date,
  scheduledEnd: Date,
  excludedId?: string,
): Promise<number> {
  const conditions = [
    lt(appointment.scheduledStart, scheduledEnd),
    gt(appointment.scheduledEnd, scheduledStart),
    inArray(appointment.status, overlapStatuses),
  ];
  if (excludedId) conditions.push(ne(appointment.id, excludedId));
  const [result] = await transaction
    .select({ value: count() })
    .from(appointment)
    .where(and(...conditions));
  return result?.value ?? 0;
}

export async function createAppointment(input: unknown, actor: SafeUser): Promise<AppointmentDto> {
  const parsed = appointmentCreateInputSchema.parse(input);
  const times = schedule(parsed);

  return db.transaction(async (transaction) => {
    const [patientRecord] = await transaction
      .select({
        id: patient.id,
        patientNumber: patient.patientNumber,
        firstName: patient.firstName,
        lastName: patient.lastName,
        archivedAt: patient.archivedAt,
      })
      .from(patient)
      .where(eq(patient.id, parsed.patientId))
      .limit(1)
      .for("update");
    if (!patientRecord) throw new NotFoundError();
    if (patientRecord.archivedAt) {
      throw new ConflictError("Archived patients cannot receive new appointments.");
    }

    const conflictCount = await countOverlaps(
      transaction,
      times.scheduledStart,
      times.scheduledEnd,
    );
    if (conflictCount > 0 && !parsed.allowOverlap) {
      throw new AppointmentOverlapError(conflictCount);
    }

    const [created] = await transaction
      .insert(appointment)
      .values({
        patientId: patientRecord.id,
        scheduledStart: times.scheduledStart,
        scheduledEnd: times.scheduledEnd,
        administrativeReason: parsed.administrativeReason,
        createdBy: actor.id,
      })
      .returning();
    if (!created) throw new Error("Appointment insert returned no record.");

    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: "APPOINTMENT_CREATED",
      entityType: "appointment",
      entityId: created.id,
      metadata: { version: created.version, overlapConfirmed: conflictCount > 0 },
    });
    return toAppointmentDto(created, patientRecord);
  });
}

export async function rescheduleAppointment(
  appointmentId: string,
  input: unknown,
  actor: SafeUser,
): Promise<AppointmentDto> {
  const parsed = appointmentRescheduleInputSchema.parse(input);
  const times = schedule(parsed);

  return db.transaction(async (transaction) => {
    const [current] = await transaction
      .select({
        appointment,
        patientNumber: patient.patientNumber,
        firstName: patient.firstName,
        lastName: patient.lastName,
      })
      .from(appointment)
      .innerJoin(patient, eq(appointment.patientId, patient.id))
      .where(eq(appointment.id, appointmentId))
      .limit(1);
    if (!current) throw new NotFoundError();
    if (current.appointment.version !== parsed.expectedVersion) {
      throw new ConflictError(
        "This appointment was changed by another user. Reload and try again.",
      );
    }
    if (current.appointment.status !== "SCHEDULED") {
      throw new ConflictError("Only scheduled appointments can be rescheduled.");
    }

    const conflictCount = await countOverlaps(
      transaction,
      times.scheduledStart,
      times.scheduledEnd,
      appointmentId,
    );
    if (conflictCount > 0 && !parsed.allowOverlap) {
      throw new AppointmentOverlapError(conflictCount);
    }

    const [updated] = await transaction
      .update(appointment)
      .set({
        scheduledStart: times.scheduledStart,
        scheduledEnd: times.scheduledEnd,
        administrativeReason: parsed.administrativeReason,
        updatedAt: new Date(),
        version: sql`${appointment.version} + 1`,
      })
      .where(
        and(
          eq(appointment.id, appointmentId),
          eq(appointment.version, parsed.expectedVersion),
          eq(appointment.status, "SCHEDULED"),
        ),
      )
      .returning();
    if (!updated) {
      throw new ConflictError(
        "This appointment was changed by another user. Reload and try again.",
      );
    }

    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: "APPOINTMENT_RESCHEDULED",
      entityType: "appointment",
      entityId: updated.id,
      metadata: {
        changedFields: ["scheduledStart", "scheduledEnd", "administrativeReason"],
        version: updated.version,
        overlapConfirmed: conflictCount > 0,
      },
    });
    return toAppointmentDto(updated, current);
  });
}

export async function transitionAppointmentStatus(
  appointmentId: string,
  input: unknown,
  actor: SafeUser,
): Promise<AppointmentDto> {
  const parsed = appointmentTransitionInputSchema.parse(input);

  return db.transaction(async (transaction) => {
    const [current] = await transaction
      .select({
        appointment,
        patientNumber: patient.patientNumber,
        firstName: patient.firstName,
        lastName: patient.lastName,
      })
      .from(appointment)
      .innerJoin(patient, eq(appointment.patientId, patient.id))
      .where(eq(appointment.id, appointmentId))
      .limit(1);
    if (!current) throw new NotFoundError();
    if (current.appointment.version !== parsed.expectedVersion) {
      throw new ConflictError(
        "This appointment was changed by another user. Reload and try again.",
      );
    }
    if (!canRoleTransition(actor.role, current.appointment.status, parsed.targetStatus)) {
      const validForDoctor = canRoleTransition(
        "DOCTOR",
        current.appointment.status,
        parsed.targetStatus,
      );
      if (validForDoctor) throw new ForbiddenError();
      throw new ConflictError("That appointment status transition is not allowed.");
    }

    const cancelled = parsed.targetStatus === "CANCELLED";
    const [updated] = await transaction
      .update(appointment)
      .set({
        status: parsed.targetStatus,
        cancelledAt: cancelled ? new Date() : null,
        cancelledBy: cancelled ? actor.id : null,
        updatedAt: new Date(),
        version: sql`${appointment.version} + 1`,
      })
      .where(
        and(
          eq(appointment.id, appointmentId),
          eq(appointment.version, parsed.expectedVersion),
          eq(appointment.status, current.appointment.status),
        ),
      )
      .returning();
    if (!updated) {
      throw new ConflictError(
        "This appointment was changed by another user. Reload and try again.",
      );
    }

    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: "APPOINTMENT_STATUS_CHANGED",
      entityType: "appointment",
      entityId: updated.id,
      metadata: {
        oldStatus: current.appointment.status,
        newStatus: updated.status,
        version: updated.version,
      },
    });
    return toAppointmentDto(updated, current);
  });
}
