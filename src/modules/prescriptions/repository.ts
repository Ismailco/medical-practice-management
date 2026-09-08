import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import {
  clinicProfile,
  doctorProfessionalProfile,
  patient,
  prescription,
  prescriptionIssueSnapshot,
  prescriptionItem,
} from "@/db/schema";
import { logError } from "@/lib/logger";
import type {
  PracticeProfileDto,
  PrescriptionDetailDto,
  PrescriptionSummaryDto,
  PrescriptionSnapshotDto,
} from "./dto";
import type { IssuedPrescriptionDocumentData } from "./pdf";

const summarySelection = {
  id: prescription.id,
  patientId: prescription.patientId,
  patientNumber: patient.patientNumber,
  firstName: patient.firstName,
  lastName: patient.lastName,
  prescriptionNumber: prescription.prescriptionNumber,
  status: prescription.status,
  issueDate: prescription.issueDate,
  consultationId: prescription.consultationId,
  replacesPrescriptionId: prescription.replacesPrescriptionId,
  version: prescription.version,
};

type SummaryRow = {
  id: string;
  patientId: string;
  patientNumber: string;
  firstName: string;
  lastName: string;
  prescriptionNumber: string | null;
  status: "DRAFT" | "FINALIZED" | "VOID";
  issueDate: string | null;
  consultationId: string | null;
  replacesPrescriptionId: string | null;
  version: number;
};

function toSummary(row: SummaryRow): PrescriptionSummaryDto {
  return {
    id: row.id,
    patientId: row.patientId,
    patientNumber: row.patientNumber,
    patientDisplayName: `${row.firstName} ${row.lastName}`,
    prescriptionNumber: row.prescriptionNumber,
    status: row.status,
    issueDate: row.issueDate,
    consultationId: row.consultationId,
    replacesPrescriptionId: row.replacesPrescriptionId,
    version: row.version,
  };
}

function summaryQuery() {
  return db
    .select(summarySelection)
    .from(prescription)
    .innerJoin(patient, eq(prescription.patientId, patient.id));
}

export async function listPrescriptions(
  patientId?: string,
): Promise<readonly PrescriptionSummaryDto[]> {
  try {
    const rows = await summaryQuery()
      .where(patientId ? eq(prescription.patientId, patientId) : undefined)
      .orderBy(desc(prescription.createdAt))
      .limit(100);
    return rows.map(toSummary);
  } catch {
    logError("Prescription list failed", { errorCode: "PRESCRIPTION_LIST_FAILED" });
    throw new Error("Prescription records are temporarily unavailable.");
  }
}

export async function findPrescriptionDetail(id: string): Promise<PrescriptionDetailDto | null> {
  try {
    const [record] = await db
      .select({
        ...summarySelection,
        doctorId: prescription.doctorId,
        issuedAt: prescription.issuedAt,
        voidedAt: prescription.voidedAt,
        createdAt: prescription.createdAt,
        updatedAt: prescription.updatedAt,
        snapshot: {
          patientNumber: prescriptionIssueSnapshot.patientNumber,
          patientName: prescriptionIssueSnapshot.patientName,
          patientDateOfBirth: prescriptionIssueSnapshot.patientDateOfBirth,
          doctorName: prescriptionIssueSnapshot.doctorName,
          doctorSpecialty: prescriptionIssueSnapshot.doctorSpecialty,
          doctorProfessionalIdentifier: prescriptionIssueSnapshot.doctorProfessionalIdentifier,
          clinicName: prescriptionIssueSnapshot.clinicName,
          clinicAddress: prescriptionIssueSnapshot.clinicAddress,
          clinicPhone: prescriptionIssueSnapshot.clinicPhone,
          templateVersion: prescriptionIssueSnapshot.templateVersion,
        },
      })
      .from(prescription)
      .innerJoin(patient, eq(prescription.patientId, patient.id))
      .leftJoin(
        prescriptionIssueSnapshot,
        eq(prescriptionIssueSnapshot.prescriptionId, prescription.id),
      )
      .where(eq(prescription.id, id))
      .limit(1);
    if (!record) return null;

    const [items, replacedBy] = await Promise.all([
      db
        .select({
          id: prescriptionItem.id,
          position: prescriptionItem.position,
          medicationName: prescriptionItem.medicationName,
          dosage: prescriptionItem.dosage,
          form: prescriptionItem.form,
          frequency: prescriptionItem.frequency,
          duration: prescriptionItem.duration,
          quantity: prescriptionItem.quantity,
          route: prescriptionItem.route,
          instructions: prescriptionItem.instructions,
        })
        .from(prescriptionItem)
        .where(eq(prescriptionItem.prescriptionId, id))
        .orderBy(asc(prescriptionItem.position)),
      listPrescriptionsReplacedBy(id),
    ]);

    const rawSnapshot = record.snapshot;
    const snapshot: PrescriptionSnapshotDto | null =
      rawSnapshot?.patientNumber &&
      rawSnapshot.patientName &&
      rawSnapshot.patientDateOfBirth &&
      rawSnapshot.doctorName &&
      rawSnapshot.clinicName &&
      rawSnapshot.templateVersion
        ? {
            patientNumber: rawSnapshot.patientNumber,
            patientName: rawSnapshot.patientName,
            patientDateOfBirth: rawSnapshot.patientDateOfBirth,
            doctorName: rawSnapshot.doctorName,
            doctorSpecialty: rawSnapshot.doctorSpecialty,
            doctorProfessionalIdentifier: rawSnapshot.doctorProfessionalIdentifier,
            clinicName: rawSnapshot.clinicName,
            clinicAddress: rawSnapshot.clinicAddress,
            clinicPhone: rawSnapshot.clinicPhone,
            templateVersion: rawSnapshot.templateVersion,
          }
        : null;
    return {
      ...toSummary(record),
      doctorId: record.doctorId,
      issuedAt: record.issuedAt?.toISOString() ?? null,
      voidedAt: record.voidedAt?.toISOString() ?? null,
      items,
      snapshot,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      replacedBy,
    };
  } catch {
    logError("Prescription lookup failed", { errorCode: "PRESCRIPTION_LOOKUP_FAILED" });
    throw new Error("Prescription records are temporarily unavailable.");
  }
}

async function listPrescriptionsReplacedBy(id: string): Promise<readonly PrescriptionSummaryDto[]> {
  const rows = await summaryQuery()
    .where(eq(prescription.replacesPrescriptionId, id))
    .orderBy(desc(prescription.createdAt))
    .limit(20);
  return rows.map(toSummary);
}

export function listPatientPrescriptions(
  patientId: string,
): Promise<readonly PrescriptionSummaryDto[]> {
  return listPrescriptions(patientId);
}

export function listConsultationPrescriptions(
  consultationId: string,
): Promise<readonly PrescriptionSummaryDto[]> {
  return listPrescriptionsByConsultation(consultationId);
}

export async function findIssuedPrescriptionDocumentData(
  id: string,
): Promise<IssuedPrescriptionDocumentData | null> {
  try {
    const [record] = await db
      .select({
        prescriptionNumber: prescription.prescriptionNumber,
        issueDate: prescription.issueDate,
        status: prescription.status,
        snapshot: {
          patientNumber: prescriptionIssueSnapshot.patientNumber,
          patientName: prescriptionIssueSnapshot.patientName,
          patientDateOfBirth: prescriptionIssueSnapshot.patientDateOfBirth,
          doctorName: prescriptionIssueSnapshot.doctorName,
          doctorSpecialty: prescriptionIssueSnapshot.doctorSpecialty,
          doctorProfessionalIdentifier: prescriptionIssueSnapshot.doctorProfessionalIdentifier,
          clinicName: prescriptionIssueSnapshot.clinicName,
          clinicAddress: prescriptionIssueSnapshot.clinicAddress,
          clinicPhone: prescriptionIssueSnapshot.clinicPhone,
          templateVersion: prescriptionIssueSnapshot.templateVersion,
        },
      })
      .from(prescription)
      .leftJoin(
        prescriptionIssueSnapshot,
        eq(prescriptionIssueSnapshot.prescriptionId, prescription.id),
      )
      .where(eq(prescription.id, id))
      .limit(1);
    if (!record) return null;
    if (record.status !== "FINALIZED" && record.status !== "VOID") return null;
    const snapshot = record.snapshot;
    if (!record.prescriptionNumber || !record.issueDate || !snapshot?.templateVersion) {
      throw new Error("Issued prescription snapshot is incomplete.");
    }
    const items = await db
      .select({
        position: prescriptionItem.position,
        medicationName: prescriptionItem.medicationName,
        dosage: prescriptionItem.dosage,
        form: prescriptionItem.form,
        frequency: prescriptionItem.frequency,
        duration: prescriptionItem.duration,
        quantity: prescriptionItem.quantity,
        route: prescriptionItem.route,
        instructions: prescriptionItem.instructions,
      })
      .from(prescriptionItem)
      .where(eq(prescriptionItem.prescriptionId, id))
      .orderBy(asc(prescriptionItem.position));
    if (items.length === 0) throw new Error("Issued prescription has no items.");
    const [replacement] = await db
      .select({ id: prescription.id })
      .from(prescription)
      .where(
        and(
          eq(prescription.replacesPrescriptionId, id),
          inArray(prescription.status, ["FINALIZED", "VOID"]),
        ),
      )
      .limit(1);
    return {
      prescriptionNumber: record.prescriptionNumber,
      issueDate: record.issueDate,
      status: record.status,
      isReplaced: Boolean(replacement),
      templateVersion: snapshot.templateVersion,
      patient: {
        number: snapshot.patientNumber,
        name: snapshot.patientName,
        dateOfBirth: snapshot.patientDateOfBirth,
      },
      doctor: {
        name: snapshot.doctorName,
        specialty: snapshot.doctorSpecialty,
        professionalIdentifier: snapshot.doctorProfessionalIdentifier,
      },
      clinic: {
        name: snapshot.clinicName,
        address: snapshot.clinicAddress,
        phone: snapshot.clinicPhone,
      },
      items,
    };
  } catch {
    logError("Prescription PDF source lookup failed", {
      errorCode: "PRESCRIPTION_PDF_SOURCE_FAILED",
    });
    throw new Error("This issued prescription cannot be rendered safely.");
  }
}

async function listPrescriptionsByConsultation(
  consultationId: string,
): Promise<readonly PrescriptionSummaryDto[]> {
  const rows = await summaryQuery()
    .where(eq(prescription.consultationId, consultationId))
    .orderBy(desc(prescription.createdAt))
    .limit(50);
  return rows.map(toSummary);
}

export async function getPracticeProfile(doctorId: string): Promise<PracticeProfileDto> {
  const [clinic] = await db.select().from(clinicProfile).where(eq(clinicProfile.id, 1)).limit(1);
  const [doctor] = await db
    .select()
    .from(doctorProfessionalProfile)
    .where(eq(doctorProfessionalProfile.userId, doctorId))
    .limit(1);
  return {
    clinic: clinic
      ? {
          id: clinic.id,
          name: clinic.name,
          address: clinic.address,
          phone: clinic.phone,
          version: clinic.version,
        }
      : { id: 1, name: "", address: null, phone: null, version: 0 },
    doctor: doctor
      ? {
          userId: doctor.userId,
          displayName: doctor.displayName,
          specialty: doctor.specialty,
          professionalIdentifier: doctor.professionalIdentifier,
          version: doctor.version,
        }
      : {
          userId: doctorId,
          displayName: "",
          specialty: null,
          professionalIdentifier: null,
          version: 0,
        },
  };
}
