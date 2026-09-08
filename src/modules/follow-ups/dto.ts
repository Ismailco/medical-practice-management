import type { followUp } from "@/db/schema";

type FollowUpStatus = typeof followUp.$inferSelect.status;

export type FollowUpSummaryDto = Readonly<{
  id: string;
  patientId: string;
  patientNumber: string;
  patientDisplayName: string;
  consultationId: string | null;
  dueDate: string;
  reason: string;
  status: FollowUpStatus;
  version: number;
}>;

export type FollowUpDetailDto = FollowUpSummaryDto &
  Readonly<{
    createdByName: string;
    completedAt: string | null;
    completedByName: string | null;
    cancelledAt: string | null;
    cancelledByName: string | null;
    createdAt: string;
    updatedAt: string;
  }>;

export type OperationalFollowUpsDto = Readonly<{
  today: string;
  overdue: readonly FollowUpSummaryDto[];
  dueToday: readonly FollowUpSummaryDto[];
  upcoming: readonly FollowUpSummaryDto[];
}>;
