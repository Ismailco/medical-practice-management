import type { consultation } from "@/db/schema";

type ConsultationStatus = typeof consultation.$inferSelect.status;

export type ConsultationSummaryDto = Readonly<{
  id: string;
  patientId: string;
  patientNumber: string;
  patientDisplayName: string;
  appointmentId: string | null;
  status: ConsultationStatus;
  startedAt: string;
  finalizedAt: string | null;
  version: number;
}>;

export type ClinicalRevisionDto = Readonly<{
  id: string;
  revisionNumber: number;
  reasonForVisit: string | null;
  observations: string | null;
  diagnosis: string | null;
  notes: string | null;
  createdByName: string;
  createdAt: string;
  final: boolean;
}>;

export type ClinicalAddendumDto = Readonly<{
  id: string;
  content: string;
  createdByName: string;
  createdAt: string;
}>;

export type ConsultationDetailDto = ConsultationSummaryDto &
  Readonly<{
    doctorName: string;
    revisionCount: number;
    revisions: readonly ClinicalRevisionDto[];
    addenda: readonly ClinicalAddendumDto[];
  }>;
