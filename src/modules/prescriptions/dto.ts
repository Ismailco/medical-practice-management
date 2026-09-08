import type { prescription, prescriptionItem } from "@/db/schema";

export type PrescriptionStatus = typeof prescription.$inferSelect.status;

export type PrescriptionItemDto = Readonly<{
  id: string;
  position: number;
  medicationName: string;
  dosage: string | null;
  form: string | null;
  frequency: string | null;
  duration: string | null;
  quantity: string | null;
  route: string | null;
  instructions: string | null;
}>;

export type PrescriptionSummaryDto = Readonly<{
  id: string;
  patientId: string;
  patientNumber: string;
  patientDisplayName: string;
  prescriptionNumber: string | null;
  status: PrescriptionStatus;
  issueDate: string | null;
  consultationId: string | null;
  replacesPrescriptionId: string | null;
  version: number;
}>;

export type PrescriptionSnapshotDto = Readonly<{
  patientNumber: string;
  patientName: string;
  patientDateOfBirth: string;
  doctorName: string;
  doctorSpecialty: string | null;
  doctorProfessionalIdentifier: string | null;
  clinicName: string;
  clinicAddress: string | null;
  clinicPhone: string | null;
  templateVersion: string;
}>;

export type PrescriptionDetailDto = PrescriptionSummaryDto &
  Readonly<{
    doctorId: string;
    issuedAt: string | null;
    voidedAt: string | null;
    replacesPrescriptionId: string | null;
    items: readonly PrescriptionItemDto[];
    snapshot: PrescriptionSnapshotDto | null;
    createdAt: string;
    updatedAt: string;
    replacedBy: readonly PrescriptionSummaryDto[];
  }>;

export type PracticeProfileDto = Readonly<{
  clinic: Readonly<{
    id: number;
    name: string;
    address: string | null;
    phone: string | null;
    version: number;
  }>;
  doctor: Readonly<{
    userId: string;
    displayName: string;
    specialty: string | null;
    professionalIdentifier: string | null;
    version: number;
  }>;
}>;

export type PrescriptionItemRecord = typeof prescriptionItem.$inferSelect;
