import "server-only";

import { and, asc, count, desc, eq, gt, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db/client";
import { followUp, patient, user } from "@/db/schema";
import { logError } from "@/lib/logger";
import { clinicToday } from "@/modules/appointments/timezone";
import type { FollowUpDetailDto, FollowUpSummaryDto, OperationalFollowUpsDto } from "./dto";

const createdByUser = alias(user, "follow_up_created_by");
const completedByUser = alias(user, "follow_up_completed_by");
const cancelledByUser = alias(user, "follow_up_cancelled_by");
const SECTION_LIMIT = 50;

const summarySelection = {
  id: followUp.id,
  patientId: followUp.patientId,
  patientNumber: patient.patientNumber,
  firstName: patient.firstName,
  lastName: patient.lastName,
  consultationId: followUp.consultationId,
  dueDate: followUp.dueDate,
  reason: followUp.reason,
  status: followUp.status,
  version: followUp.version,
};

type SummaryRow = {
  id: string;
  patientId: string;
  patientNumber: string;
  firstName: string;
  lastName: string;
  consultationId: string | null;
  dueDate: string;
  reason: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  version: number;
};

function toSummary(row: SummaryRow): FollowUpSummaryDto {
  return {
    id: row.id,
    patientId: row.patientId,
    patientNumber: row.patientNumber,
    patientDisplayName: `${row.firstName} ${row.lastName}`,
    consultationId: row.consultationId,
    dueDate: row.dueDate,
    reason: row.reason,
    status: row.status,
    version: row.version,
  };
}

function summaryQuery() {
  return db
    .select(summarySelection)
    .from(followUp)
    .innerJoin(patient, eq(followUp.patientId, patient.id));
}

export async function listOperationalFollowUps(
  today = clinicToday(),
): Promise<OperationalFollowUpsDto> {
  try {
    const [overdue, dueToday, upcoming] = await Promise.all([
      summaryQuery()
        .where(and(eq(followUp.status, "PENDING"), lt(followUp.dueDate, today)))
        .orderBy(asc(followUp.dueDate), asc(patient.lastName), asc(patient.firstName))
        .limit(SECTION_LIMIT),
      summaryQuery()
        .where(and(eq(followUp.status, "PENDING"), eq(followUp.dueDate, today)))
        .orderBy(asc(patient.lastName), asc(patient.firstName), asc(followUp.createdAt))
        .limit(SECTION_LIMIT),
      summaryQuery()
        .where(and(eq(followUp.status, "PENDING"), gt(followUp.dueDate, today)))
        .orderBy(asc(followUp.dueDate), asc(patient.lastName), asc(patient.firstName))
        .limit(SECTION_LIMIT),
    ]);
    return {
      today,
      overdue: overdue.map(toSummary),
      dueToday: dueToday.map(toSummary),
      upcoming: upcoming.map(toSummary),
    };
  } catch {
    logError("Follow-up list failed", { errorCode: "FOLLOW_UP_LIST_FAILED" });
    throw new Error("Follow-up records are temporarily unavailable.");
  }
}

export async function followUpDashboardSummary(today = clinicToday()) {
  try {
    const [overdueRows, dueTodayRows] = await Promise.all([
      db
        .select({ value: count() })
        .from(followUp)
        .where(and(eq(followUp.status, "PENDING"), lt(followUp.dueDate, today))),
      db
        .select({ value: count() })
        .from(followUp)
        .where(and(eq(followUp.status, "PENDING"), eq(followUp.dueDate, today))),
    ]);
    return {
      overdue: overdueRows[0]?.value ?? 0,
      dueToday: dueTodayRows[0]?.value ?? 0,
    } as const;
  } catch {
    logError("Follow-up dashboard summary failed", {
      errorCode: "FOLLOW_UP_DASHBOARD_FAILED",
    });
    throw new Error("Follow-up records are temporarily unavailable.");
  }
}

export async function findFollowUpDetail(id: string): Promise<FollowUpDetailDto | null> {
  try {
    const [record] = await db
      .select({
        ...summarySelection,
        createdByName: createdByUser.name,
        completedAt: followUp.completedAt,
        completedByName: completedByUser.name,
        cancelledAt: followUp.cancelledAt,
        cancelledByName: cancelledByUser.name,
        createdAt: followUp.createdAt,
        updatedAt: followUp.updatedAt,
      })
      .from(followUp)
      .innerJoin(patient, eq(followUp.patientId, patient.id))
      .innerJoin(createdByUser, eq(followUp.createdBy, createdByUser.id))
      .leftJoin(completedByUser, eq(followUp.completedBy, completedByUser.id))
      .leftJoin(cancelledByUser, eq(followUp.cancelledBy, cancelledByUser.id))
      .where(eq(followUp.id, id))
      .limit(1);
    if (!record) return null;
    return {
      ...toSummary(record),
      createdByName: record.createdByName,
      completedAt: record.completedAt?.toISOString() ?? null,
      completedByName: record.completedByName,
      cancelledAt: record.cancelledAt?.toISOString() ?? null,
      cancelledByName: record.cancelledByName,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  } catch {
    logError("Follow-up lookup failed", { errorCode: "FOLLOW_UP_LOOKUP_FAILED" });
    throw new Error("Follow-up records are temporarily unavailable.");
  }
}

async function listRelatedFollowUps(condition: ReturnType<typeof eq>) {
  const rows = await summaryQuery().where(condition).orderBy(desc(followUp.createdAt)).limit(50);
  return rows.map(toSummary);
}

export function listPatientFollowUps(patientId: string): Promise<readonly FollowUpSummaryDto[]> {
  return listRelatedFollowUps(eq(followUp.patientId, patientId));
}

export function listConsultationFollowUps(
  consultationId: string,
): Promise<readonly FollowUpSummaryDto[]> {
  return listRelatedFollowUps(eq(followUp.consultationId, consultationId));
}
