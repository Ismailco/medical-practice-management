import "server-only";

import { and, asc, count, eq, isNull, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db/client";
import { patient } from "@/db/schema";
import { logError } from "@/lib/logger";
import {
  toAdministrativePatient,
  type AdministrativePatient,
  type AdministrativePatientListItem,
} from "./dto";
import { normalizePhone, type PatientSearchInput } from "./validation";

export const PATIENT_PAGE_SIZE = 20;

export type PatientSearchResult = Readonly<{
  items: readonly AdministrativePatientListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}>;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function searchCondition(query: string): SQL | undefined {
  if (!query) return undefined;

  const pattern = `%${escapeLike(query)}%`;
  const phoneQuery = normalizePhone(query);
  const conditions: SQL[] = [
    eq(patient.patientNumber, query.toUpperCase()),
    sql`${patient.firstName} ILIKE ${pattern} ESCAPE '\\'`,
    sql`${patient.lastName} ILIKE ${pattern} ESCAPE '\\'`,
    sql`lower(${patient.email}) = ${query.toLowerCase()}`,
  ];

  if (phoneQuery && phoneQuery.replace(/\D/g, "").length >= 3) {
    conditions.push(eq(patient.phoneNormalized, phoneQuery));
  }

  return or(...conditions);
}

export async function searchAdministrativePatients(
  input: PatientSearchInput,
): Promise<PatientSearchResult> {
  const filters: SQL[] = [];
  if (!input.includeArchived) filters.push(isNull(patient.archivedAt));
  const queryCondition = searchCondition(input.q);
  if (queryCondition) filters.push(queryCondition);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (input.page - 1) * PATIENT_PAGE_SIZE;
  const exactPatientNumber = input.q.toUpperCase();

  try {
    const [items, totals] = await Promise.all([
      db
        .select({
          id: patient.id,
          patientNumber: patient.patientNumber,
          firstName: patient.firstName,
          lastName: patient.lastName,
          dateOfBirth: patient.dateOfBirth,
          phone: patient.phone,
          archivedAt: patient.archivedAt,
          version: patient.version,
        })
        .from(patient)
        .where(where)
        .orderBy(
          sql`CASE WHEN ${patient.patientNumber} = ${exactPatientNumber} THEN 0 ELSE 1 END`,
          asc(patient.lastName),
          asc(patient.firstName),
          asc(patient.patientNumber),
        )
        .limit(PATIENT_PAGE_SIZE)
        .offset(offset),
      db.select({ value: count() }).from(patient).where(where),
    ]);

    const total = totals[0]?.value ?? 0;
    return {
      items: items.map((item) => ({
        id: item.id,
        patientNumber: item.patientNumber,
        firstName: item.firstName,
        lastName: item.lastName,
        dateOfBirth: item.dateOfBirth,
        phone: item.phone,
        archived: item.archivedAt !== null,
        version: item.version,
      })),
      page: input.page,
      pageSize: PATIENT_PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PATIENT_PAGE_SIZE)),
    };
  } catch {
    logError("Patient search failed", { errorCode: "PATIENT_SEARCH_FAILED" });
    throw new Error("Patient records are temporarily unavailable.");
  }
}

export async function findAdministrativePatientById(
  patientId: string,
): Promise<AdministrativePatient | null> {
  try {
    const [record] = await db.select().from(patient).where(eq(patient.id, patientId)).limit(1);
    return record ? toAdministrativePatient(record) : null;
  } catch {
    logError("Patient lookup failed", { errorCode: "PATIENT_LOOKUP_FAILED" });
    throw new Error("Patient records are temporarily unavailable.");
  }
}
