import { humanizeStatus, type PresentationStatus } from "@/lib/presentation";

const toneByStatus: Record<string, string> = {
  ACTIVE: "status-success",
  COMPLETED: "status-success",
  FINALIZED: "status-success",
  ARRIVED: "status-warning",
  PENDING: "status-warning",
  OVERDUE: "status-danger",
  CANCELLED: "status-danger",
  NO_SHOW: "status-danger",
  VOID: "status-danger",
  ARCHIVED: "status-neutral",
  DRAFT: "status-info",
  SCHEDULED: "status-info",
  IN_CONSULTATION: "status-info",
  IN_PROGRESS: "status-info",
  REPLACED: "status-neutral",
  SUPERSEDED: "status-neutral",
};

export function StatusBadge({
  status,
  label,
}: {
  status: PresentationStatus | string;
  label?: string;
}) {
  return (
    <span className={`status-badge ${toneByStatus[status] ?? "status-neutral"}`}>
      <span aria-hidden="true" className="status-dot" />
      {label ?? humanizeStatus(status)}
    </span>
  );
}
