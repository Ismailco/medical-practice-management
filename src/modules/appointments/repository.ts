import "server-only";

import { and, asc, count, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { appointment, patient } from "@/db/schema";
import { logError } from "@/lib/logger";
import { toAppointmentDto, type AppointmentDto } from "./dto";
import { clinicDayRange, clinicToday } from "./timezone";
import type { AppointmentStatus } from "./validation";

const HISTORY_PAGE_SIZE = 20;
const operationalStatuses: AppointmentStatus[] = ["SCHEDULED", "ARRIVED", "IN_CONSULTATION"];

const appointmentSelection = {
  appointment,
  patientNumber: patient.patientNumber,
  firstName: patient.firstName,
  lastName: patient.lastName,
};

function mapJoined(record: {
  appointment: typeof appointment.$inferSelect;
  patientNumber: string;
  firstName: string;
  lastName: string;
}): AppointmentDto {
  return toAppointmentDto(record.appointment, record);
}

export async function findAppointmentById(id: string): Promise<AppointmentDto | null> {
  try {
    const [record] = await db
      .select(appointmentSelection)
      .from(appointment)
      .innerJoin(patient, eq(appointment.patientId, patient.id))
      .where(eq(appointment.id, id))
      .limit(1);
    return record ? mapJoined(record) : null;
  } catch {
    logError("Appointment lookup failed", { errorCode: "APPOINTMENT_LOOKUP_FAILED" });
    throw new Error("Appointment records are temporarily unavailable.");
  }
}

export async function listDailyAgenda(
  date: string,
  status?: AppointmentStatus,
): Promise<readonly AppointmentDto[]> {
  const range = clinicDayRange(date);
  const conditions = [
    gte(appointment.scheduledStart, range.start),
    lt(appointment.scheduledStart, range.end),
  ];
  if (status) conditions.push(eq(appointment.status, status));

  try {
    const rows = await db
      .select(appointmentSelection)
      .from(appointment)
      .innerJoin(patient, eq(appointment.patientId, patient.id))
      .where(and(...conditions))
      .orderBy(asc(appointment.scheduledStart), asc(patient.lastName), asc(patient.firstName));
    return rows.map(mapJoined);
  } catch {
    logError("Daily agenda query failed", { errorCode: "APPOINTMENT_AGENDA_FAILED" });
    throw new Error("The appointment agenda is temporarily unavailable.");
  }
}

export async function listUpcomingAppointments(
  now: Date,
  end: Date,
): Promise<readonly AppointmentDto[]> {
  const rows = await db
    .select(appointmentSelection)
    .from(appointment)
    .innerJoin(patient, eq(appointment.patientId, patient.id))
    .where(
      and(
        gte(appointment.scheduledStart, now),
        lt(appointment.scheduledStart, end),
        inArray(appointment.status, operationalStatuses),
      ),
    )
    .orderBy(asc(appointment.scheduledStart))
    .limit(100);
  return rows.map(mapJoined);
}

export async function listPatientAppointments(
  patientId: string,
  page = 1,
): Promise<
  Readonly<{ items: readonly AppointmentDto[]; page: number; total: number; totalPages: number }>
> {
  const [rows, totals] = await Promise.all([
    db
      .select(appointmentSelection)
      .from(appointment)
      .innerJoin(patient, eq(appointment.patientId, patient.id))
      .where(eq(appointment.patientId, patientId))
      .orderBy(desc(appointment.scheduledStart))
      .limit(HISTORY_PAGE_SIZE)
      .offset((page - 1) * HISTORY_PAGE_SIZE),
    db.select({ value: count() }).from(appointment).where(eq(appointment.patientId, patientId)),
  ]);
  const total = totals[0]?.value ?? 0;
  return {
    items: rows.map(mapJoined),
    page,
    total,
    totalPages: Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)),
  };
}

export async function appointmentDashboardSummary(now = new Date()) {
  const today = await listDailyAgenda(clinicToday(now));
  const next = today.find(
    (item) => new Date(item.scheduledStart) >= now && operationalStatuses.includes(item.status),
  );
  return {
    total: today.length,
    waiting: today.filter((item) => item.status === "ARRIVED").length,
    next: next ?? null,
  } as const;
}

export async function searchActivePatientIdentities(query: string) {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  const pattern = `%${normalized.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db
    .select({
      id: patient.id,
      patientNumber: patient.patientNumber,
      firstName: patient.firstName,
      lastName: patient.lastName,
    })
    .from(patient)
    .where(
      and(
        isNull(patient.archivedAt),
        or(
          eq(patient.patientNumber, normalized.toUpperCase()),
          sql`${patient.firstName} ILIKE ${pattern} ESCAPE '\\'`,
          sql`${patient.lastName} ILIKE ${pattern} ESCAPE '\\'`,
        ),
      ),
    )
    .orderBy(asc(patient.lastName), asc(patient.firstName))
    .limit(10);
  return rows;
}
