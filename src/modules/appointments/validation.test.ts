import { describe, expect, it } from "vitest";

import {
  appointmentCreateInputSchema,
  appointmentRescheduleInputSchema,
  appointmentTransitionInputSchema,
} from "./validation";

const valid = {
  patientId: "00000000-0000-4000-8000-000000000001",
  localDate: "2026-09-10",
  localStartTime: "09:00",
  durationMinutes: 30,
  administrativeReason: "Routine visit",
};

describe("appointment validation", () => {
  it("normalizes a bounded administrative reason", () => {
    expect(
      appointmentCreateInputSchema.parse({ ...valid, administrativeReason: "  Routine   visit  " })
        .administrativeReason,
    ).toBe("Routine visit");
  });

  it("rejects invalid dates, times, and unreasonable durations", () => {
    expect(
      appointmentCreateInputSchema.safeParse({ ...valid, localDate: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      appointmentCreateInputSchema.safeParse({ ...valid, localStartTime: "24:00" }).success,
    ).toBe(false);
    expect(appointmentCreateInputSchema.safeParse({ ...valid, durationMinutes: 0 }).success).toBe(
      false,
    );
    expect(
      appointmentCreateInputSchema.safeParse({ ...valid, durationMinutes: 10_080 }).success,
    ).toBe(false);
  });

  it("rejects initial status, creator, clinical fields, and other unknown properties", () => {
    for (const key of ["status", "createdBy", "diagnosis", "clinicalNotes", "metadata"]) {
      expect(appointmentCreateInputSchema.safeParse({ ...valid, [key]: "malicious" }).success).toBe(
        false,
      );
    }
  });

  it("requires explicit versions on reschedule and transition", () => {
    expect(appointmentRescheduleInputSchema.safeParse(valid).success).toBe(false);
    expect(appointmentTransitionInputSchema.safeParse({ targetStatus: "ARRIVED" }).success).toBe(
      false,
    );
    expect(
      appointmentTransitionInputSchema.safeParse({ targetStatus: "UNKNOWN", expectedVersion: 1 })
        .success,
    ).toBe(false);
  });
});
