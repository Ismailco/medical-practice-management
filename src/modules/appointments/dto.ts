import type { appointment } from "@/db/schema";

type AppointmentRecord = typeof appointment.$inferSelect;

export type AppointmentDto = Readonly<{
  id: string;
  patientId: string;
  patientNumber: string;
  patientDisplayName: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: AppointmentRecord["status"];
  administrativeReason: string | null;
  version: number;
  cancelledAt: string | null;
}>;

type PatientIdentity = Readonly<{
  patientNumber: string;
  firstName: string;
  lastName: string;
}>;

export function toAppointmentDto(
  record: AppointmentRecord,
  patientIdentity: PatientIdentity,
): AppointmentDto {
  return {
    id: record.id,
    patientId: record.patientId,
    patientNumber: patientIdentity.patientNumber,
    patientDisplayName: `${patientIdentity.firstName} ${patientIdentity.lastName}`,
    scheduledStart: record.scheduledStart.toISOString(),
    scheduledEnd: record.scheduledEnd.toISOString(),
    status: record.status,
    administrativeReason: record.administrativeReason,
    version: record.version,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
  };
}
