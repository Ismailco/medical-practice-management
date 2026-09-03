import "server-only";

import { ZodError } from "zod";

import { noStoreJson, safeRouteError } from "@/modules/auth/http";
import { AppointmentOverlapError, InvalidAppointmentTimeError } from "./errors";

export function appointmentRouteError(error: unknown): Response {
  if (error instanceof AppointmentOverlapError) {
    return noStoreJson(
      {
        error: error.message,
        code: "APPOINTMENT_OVERLAP",
        conflictCount: error.conflictCount,
      },
      { status: 409 },
    );
  }
  if (error instanceof InvalidAppointmentTimeError) {
    return noStoreJson(
      {
        error: "Please correct the highlighted fields.",
        fieldErrors: { localStartTime: error.message },
      },
      { status: 400 },
    );
  }
  if (!(error instanceof ZodError)) return safeRouteError(error);
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) fieldErrors[field] = issue.message;
  }
  return noStoreJson(
    { error: "Please correct the highlighted fields.", fieldErrors },
    { status: 400 },
  );
}
