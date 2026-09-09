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
  doctorNameArabic: string | null;
  doctorSpecialty: string | null;
  doctorSpecialtyArabic: string | null;
  doctorProfessionalIdentifier: string | null;
  doctorSocialMedia: string | null;
  clinicName: string;
  clinicNameArabic: string | null;
  clinicAddress: string | null;
  clinicAddressArabic: string | null;
  clinicCity: string | null;
  clinicCityArabic: string | null;
  clinicPhone: string | null;
  clinicPhoneSecondary: string | null;
  clinicEmail: string | null;
  clinicLogoDataUrl: string | null;
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
    nameArabic: string | null;
    address: string | null;
    addressArabic: string | null;
    city: string | null;
    cityArabic: string | null;
    phone: string | null;
    phoneSecondary: string | null;
    email: string | null;
    logoDataUrl: string | null;
    version: number;
  }>;
  doctor: Readonly<{
    userId: string;
    displayName: string;
    displayNameArabic: string | null;
    specialty: string | null;
    specialtyArabic: string | null;
    professionalIdentifier: string | null;
    socialMedia: string | null;
    version: number;
  }>;
}>;

export type PrescriptionItemRecord = typeof prescriptionItem.$inferSelect;
