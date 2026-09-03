import type { patient } from "@/db/schema";

type PatientRecord = typeof patient.$inferSelect;

export type AdministrativePatientListItem = Readonly<{
  id: string;
  patientNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string | null;
  archived: boolean;
  version: number;
}>;

export type AdministrativePatient = Readonly<{
  id: string;
  patientNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  archivedAt: Date | null;
}>;

export function toAdministrativePatient(record: PatientRecord): AdministrativePatient {
  return {
    id: record.id,
    patientNumber: record.patientNumber,
    firstName: record.firstName,
    lastName: record.lastName,
    dateOfBirth: record.dateOfBirth,
    phone: record.phone,
    email: record.email,
    address: record.address,
    emergencyContactName: record.emergencyContactName,
    emergencyContactPhone: record.emergencyContactPhone,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    version: record.version,
    archivedAt: record.archivedAt,
  };
}
