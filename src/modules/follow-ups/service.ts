import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLog, consultation, followUp, patient } from "@/db/schema";
import { clinicToday } from "@/modules/appointments/timezone";
import { ConflictError, NotFoundError } from "@/modules/auth/errors";
import type { SafeUser } from "@/modules/auth/session";
import { canTransitionFollowUp } from "./lifecycle";
import {
  followUpCreationInputSchema,
  followUpTransitionInputSchema,
  followUpUpdateInputSchema,
  type FollowUpStatus,
} from "./validation";

export type FollowUpMutationResult = Readonly<{
  id: string;
  status: FollowUpStatus;
  version: number;
}>;

function assertDueDateIsNotPast(dueDate: string): void {
  if (dueDate < clinicToday()) {
    throw new ConflictError("The due date cannot be in the past.");
  }
}

export async function createFollowUp(
  input: unknown,
  actor: SafeUser,
): Promise<FollowUpMutationResult> {
  const parsed = followUpCreationInputSchema.parse(input);
  assertDueDateIsNotPast(parsed.dueDate);

  return db.transaction(async (transaction) => {
    let patientId: string;
    let consultationId: string | null = null;
    if ("consultationId" in parsed) {
      const [consultationRecord] = await transaction
        .select({ patientId: consultation.patientId })
        .from(consultation)
        .where(eq(consultation.id, parsed.consultationId))
        .limit(1);
      if (!consultationRecord) throw new NotFoundError();
      patientId = consultationRecord.patientId;
      consultationId = parsed.consultationId;
    } else {
      patientId = parsed.patientId;
    }

    const [patientRecord] = await transaction
      .select({ id: patient.id, archivedAt: patient.archivedAt })
      .from(patient)
      .where(eq(patient.id, patientId))
      .limit(1)
      .for("update");
    if (!patientRecord) throw new NotFoundError();
    if (patientRecord.archivedAt) {
      throw new ConflictError("Archived patients cannot receive new follow-ups.");
    }

    const [created] = await transaction
      .insert(followUp)
      .values({
        patientId: patientRecord.id,
        consultationId,
        createdBy: actor.id,
        dueDate: parsed.dueDate,
        reason: parsed.reason,
      })
      .returning({ id: followUp.id, status: followUp.status, version: followUp.version });
    if (!created) throw new Error("Follow-up insert returned no record.");

    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: "FOLLOW_UP_CREATED",
      entityType: "follow_up",
      entityId: created.id,
      metadata: {
        status: created.status,
        version: created.version,
        linkedToConsultation: consultationId !== null,
      },
    });
    return created;
  });
}

export async function updatePendingFollowUp(
  id: string,
  input: unknown,
  actor: SafeUser,
): Promise<FollowUpMutationResult> {
  const parsed = followUpUpdateInputSchema.parse(input);

  return db.transaction(async (transaction) => {
    const [current] = await transaction
      .select({ status: followUp.status, version: followUp.version })
      .from(followUp)
      .where(eq(followUp.id, id))
      .limit(1)
      .for("update");
    if (!current) throw new NotFoundError();
    if (current.status !== "PENDING")
      throw new ConflictError("Terminal follow-ups cannot be edited.");
    if (current.version !== parsed.expectedVersion) {
      throw new ConflictError("This follow-up changed elsewhere. Reload before saving.");
    }

    const [updated] = await transaction
      .update(followUp)
      .set({
        dueDate: parsed.dueDate,
        reason: parsed.reason,
        updatedAt: new Date(),
        version: sql`${followUp.version} + 1`,
      })
      .where(
        and(
          eq(followUp.id, id),
          eq(followUp.status, "PENDING"),
          eq(followUp.version, parsed.expectedVersion),
        ),
      )
      .returning({ id: followUp.id, status: followUp.status, version: followUp.version });
    if (!updated) throw new ConflictError("This follow-up changed before it was saved.");

    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: "FOLLOW_UP_UPDATED",
      entityType: "follow_up",
      entityId: id,
      metadata: {
        status: updated.status,
        version: updated.version,
        changedFields: ["dueDate", "reason"],
      },
    });
    return updated;
  });
}

async function transitionFollowUp(
  id: string,
  targetStatus: "COMPLETED" | "CANCELLED",
  input: unknown,
  actor: SafeUser,
): Promise<FollowUpMutationResult> {
  const parsed = followUpTransitionInputSchema.parse(input);
  return db.transaction(async (transaction) => {
    const [current] = await transaction
      .select({ status: followUp.status, version: followUp.version })
      .from(followUp)
      .where(eq(followUp.id, id))
      .limit(1)
      .for("update");
    if (!current) throw new NotFoundError();
    if (!canTransitionFollowUp(current.status, targetStatus)) {
      throw new ConflictError("This follow-up is terminal and cannot change state.");
    }
    if (current.version !== parsed.expectedVersion) {
      throw new ConflictError("This follow-up changed elsewhere. Reload before continuing.");
    }

    const changedAt = new Date();
    const [updated] = await transaction
      .update(followUp)
      .set({
        status: targetStatus,
        ...(targetStatus === "COMPLETED"
          ? { completedAt: changedAt, completedBy: actor.id }
          : { cancelledAt: changedAt, cancelledBy: actor.id }),
        updatedAt: changedAt,
        version: sql`${followUp.version} + 1`,
      })
      .where(
        and(
          eq(followUp.id, id),
          eq(followUp.status, "PENDING"),
          eq(followUp.version, parsed.expectedVersion),
        ),
      )
      .returning({ id: followUp.id, status: followUp.status, version: followUp.version });
    if (!updated)
      throw new ConflictError("This follow-up changed before the transition completed.");

    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: targetStatus === "COMPLETED" ? "FOLLOW_UP_COMPLETED" : "FOLLOW_UP_CANCELLED",
      entityType: "follow_up",
      entityId: id,
      metadata: { status: updated.status, version: updated.version },
    });
    return updated;
  });
}

export function completeFollowUp(
  id: string,
  input: unknown,
  actor: SafeUser,
): Promise<FollowUpMutationResult> {
  return transitionFollowUp(id, "COMPLETED", input, actor);
}

export function cancelFollowUp(
  id: string,
  input: unknown,
  actor: SafeUser,
): Promise<FollowUpMutationResult> {
  return transitionFollowUp(id, "CANCELLED", input, actor);
}
