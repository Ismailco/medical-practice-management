export const roleLabels = {
  DOCTOR: "Doctor",
  SECRETARY: "Secretary",
} as const;

export const statusLabels = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
  SCHEDULED: "Scheduled",
  ARRIVED: "Arrived",
  IN_CONSULTATION: "In consultation",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
  IN_PROGRESS: "In progress",
  FINALIZED: "Finalized",
  PENDING: "Pending",
  OVERDUE: "Overdue",
  DRAFT: "Draft",
  VOID: "Void",
  REPLACED: "Replaced",
  SUPERSEDED: "Superseded",
} as const;

export type PresentationStatus = keyof typeof statusLabels;

export function humanizeStatus(value: string): string {
  if (value in statusLabels) {
    return statusLabels[value as PresentationStatus];
  }
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function validationMessage(field: string, message: string): string {
  if (/date.?of.?birth/i.test(field)) return "Enter a valid date of birth.";
  if (/email/i.test(field)) return "Enter a valid email address.";
  if (/phone/i.test(field)) return "Enter a valid phone number.";
  if (/first.?name/i.test(field)) return "Enter the patient's first name.";
  if (/last.?name/i.test(field)) return "Enter the patient's last name.";
  if (/local.?date/i.test(field)) return "Choose a valid appointment date.";
  if (/local.?start.?time/i.test(field)) return "Choose a valid appointment time.";
  if (/patient/i.test(field)) return "Select a patient.";
  if (/required|too small|expected string/i.test(message)) return "Complete this field.";
  return "Check this field and try again.";
}

export function formatDateOnly(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
