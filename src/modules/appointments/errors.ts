import { ConflictError } from "@/modules/auth/errors";

export class InvalidAppointmentTimeError extends Error {
  constructor() {
    super("This local time does not exist in the clinic timezone.");
    this.name = "InvalidAppointmentTimeError";
  }
}

export class AppointmentOverlapError extends ConflictError {
  constructor(readonly conflictCount: number) {
    super("This time overlaps another active appointment. Confirm to schedule anyway.");
    this.name = "AppointmentOverlapError";
  }
}
