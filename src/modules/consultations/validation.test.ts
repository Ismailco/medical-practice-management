import { describe, expect, it } from "vitest";

import {
  clinicalAddendumInputSchema,
  clinicalRevisionInputSchema,
  directConsultationInputSchema,
  finalizeConsultationInputSchema,
} from "./validation";

describe("consultation validation", () => {
  it("normalizes blank clinical fields and requires meaningful content", () => {
    expect(
      clinicalRevisionInputSchema.safeParse({
        expectedVersion: 1,
        reasonForVisit: " ",
        observations: "",
        diagnosis: null,
        notes: undefined,
      }).success,
    ).toBe(false);
    expect(
      clinicalRevisionInputSchema.parse({
        expectedVersion: 1,
        reasonForVisit: "  Synthetic reason  ",
        observations: null,
        diagnosis: null,
        notes: null,
      }).reasonForVisit,
    ).toBe("Synthetic reason");
  });

  it("enforces clinical text limits", () => {
    expect(
      clinicalRevisionInputSchema.safeParse({
        expectedVersion: 1,
        reasonForVisit: "x".repeat(2_001),
        observations: null,
        diagnosis: null,
        notes: null,
      }).success,
    ).toBe(false);
    expect(clinicalAddendumInputSchema.safeParse({ content: "x".repeat(20_001) }).success).toBe(
      false,
    );
  });

  it("rejects identity, lifecycle, revision, actor, and metadata injection", () => {
    const valid = { patientId: "00000000-0000-4000-8000-000000000001" };
    for (const key of [
      "doctorId",
      "appointmentId",
      "status",
      "finalizedAt",
      "finalRevisionId",
      "revisionNumber",
      "createdBy",
      "metadata",
    ]) {
      expect(
        directConsultationInputSchema.safeParse({ ...valid, [key]: "malicious" }).success,
      ).toBe(false);
    }
    expect(
      finalizeConsultationInputSchema.safeParse({ expectedVersion: 1, status: "FINALIZED" })
        .success,
    ).toBe(false);
  });
});
