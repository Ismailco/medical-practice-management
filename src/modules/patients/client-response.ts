export type PatientFieldErrors = Readonly<Record<string, string>>;

export function readPatientError(value: unknown): {
  message: string;
  fieldErrors: PatientFieldErrors;
} {
  if (typeof value !== "object" || value === null) {
    return { message: "The operation could not be completed.", fieldErrors: {} };
  }

  const message =
    "error" in value && typeof value.error === "string"
      ? value.error
      : "The operation could not be completed.";
  const fieldErrors: Record<string, string> = {};

  if (
    "fieldErrors" in value &&
    typeof value.fieldErrors === "object" &&
    value.fieldErrors !== null
  ) {
    for (const [field, error] of Object.entries(value.fieldErrors)) {
      if (typeof error === "string") fieldErrors[field] = error;
    }
  }

  return { message, fieldErrors };
}

export function readCreatedPatientId(value: unknown): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "patient" in value &&
    typeof value.patient === "object" &&
    value.patient !== null &&
    "id" in value.patient &&
    typeof value.patient.id === "string"
  ) {
    return value.patient.id;
  }

  return null;
}
