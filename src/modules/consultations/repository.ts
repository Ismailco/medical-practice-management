import "server-only";

import { alias } from "drizzle-orm/pg-core";
import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  clinicalNoteAddendum,
  clinicalNoteRevision,
  consultation,
  patient,
  user,
} from "@/db/schema";
import { logError } from "@/lib/logger";
import type {
  ClinicalAddendumDto,
  ClinicalRevisionDto,
  ConsultationDetailDto,
  ConsultationSummaryDto,
} from "./dto";

const doctor = alias(user, "consultation_doctor");
const revisionAuthor = alias(user, "revision_author");
const addendumAuthor = alias(user, "addendum_author");

const summarySelection = {
  id: consultation.id,
  patientId: consultation.patientId,
  patientNumber: patient.patientNumber,
  firstName: patient.firstName,
  lastName: patient.lastName,
  appointmentId: consultation.appointmentId,
  status: consultation.status,
  startedAt: consultation.startedAt,
  finalizedAt: consultation.finalizedAt,
  version: consultation.version,
};

type SummaryRow = {
  id: string;
  patientId: string;
  patientNumber: string;
  firstName: string;
  lastName: string;
  appointmentId: string | null;
  status: "IN_PROGRESS" | "FINALIZED";
  startedAt: Date;
  finalizedAt: Date | null;
  version: number;
};

function toSummary(row: SummaryRow): ConsultationSummaryDto {
  return {
    id: row.id,
    patientId: row.patientId,
    patientNumber: row.patientNumber,
    patientDisplayName: `${row.firstName} ${row.lastName}`,
    appointmentId: row.appointmentId,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
    version: row.version,
  };
}

export async function listConsultations(): Promise<readonly ConsultationSummaryDto[]> {
  try {
    const rows = await db
      .select(summarySelection)
      .from(consultation)
      .innerJoin(patient, eq(consultation.patientId, patient.id))
      .orderBy(desc(consultation.startedAt))
      .limit(100);
    return rows.map(toSummary);
  } catch {
    logError("Consultation list failed", { errorCode: "CONSULTATION_LIST_FAILED" });
    throw new Error("Consultation records are temporarily unavailable.");
  }
}

export async function listPatientConsultations(
  patientId: string,
): Promise<readonly ConsultationSummaryDto[]> {
  const rows = await db
    .select(summarySelection)
    .from(consultation)
    .innerJoin(patient, eq(consultation.patientId, patient.id))
    .where(eq(consultation.patientId, patientId))
    .orderBy(desc(consultation.startedAt))
    .limit(50);
  return rows.map(toSummary);
}

export async function findConsultationDetail(id: string): Promise<ConsultationDetailDto | null> {
  try {
    const [record] = await db
      .select({
        ...summarySelection,
        doctorName: doctor.name,
        revisionCount: consultation.revisionCount,
        finalRevisionId: consultation.finalRevisionId,
      })
      .from(consultation)
      .innerJoin(patient, eq(consultation.patientId, patient.id))
      .innerJoin(doctor, eq(consultation.doctorId, doctor.id))
      .where(eq(consultation.id, id))
      .limit(1);
    if (!record) return null;

    const [revisionRows, addendumRows] = await Promise.all([
      db
        .select({
          id: clinicalNoteRevision.id,
          revisionNumber: clinicalNoteRevision.revisionNumber,
          reasonForVisit: clinicalNoteRevision.reasonForVisit,
          observations: clinicalNoteRevision.observations,
          diagnosis: clinicalNoteRevision.diagnosis,
          notes: clinicalNoteRevision.notes,
          createdByName: revisionAuthor.name,
          createdAt: clinicalNoteRevision.createdAt,
        })
        .from(clinicalNoteRevision)
        .innerJoin(revisionAuthor, eq(clinicalNoteRevision.createdBy, revisionAuthor.id))
        .where(eq(clinicalNoteRevision.consultationId, id))
        .orderBy(desc(clinicalNoteRevision.revisionNumber)),
      db
        .select({
          id: clinicalNoteAddendum.id,
          content: clinicalNoteAddendum.content,
          createdByName: addendumAuthor.name,
          createdAt: clinicalNoteAddendum.createdAt,
        })
        .from(clinicalNoteAddendum)
        .innerJoin(addendumAuthor, eq(clinicalNoteAddendum.createdBy, addendumAuthor.id))
        .where(eq(clinicalNoteAddendum.consultationId, id))
        .orderBy(asc(clinicalNoteAddendum.createdAt)),
    ]);

    const revisions: ClinicalRevisionDto[] = revisionRows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      final: row.id === record.finalRevisionId,
    }));
    const addenda: ClinicalAddendumDto[] = addendumRows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
    return {
      ...toSummary(record),
      doctorName: record.doctorName,
      revisionCount: record.revisionCount,
      revisions,
      addenda,
    };
  } catch {
    logError("Consultation lookup failed", { errorCode: "CONSULTATION_LOOKUP_FAILED" });
    throw new Error("Consultation records are temporarily unavailable.");
  }
}
