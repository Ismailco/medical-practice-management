import { describe, expect, it } from "vitest";

import { prescriptionCreationInputSchema, prescriptionDraftSaveInputSchema } from "./validation";

describe("prescription validation", () => {
  it("accepts bounded physician-entered item text and normalizes blanks", () => {
    const parsed = prescriptionDraftSaveInputSchema.parse({
      expectedVersion: 1,
      consultationId: null,
      items: [
        { medicationName: "  Medication  ", dosage: "  ", instructions: "  Use as written  " },
      ],
    });
    expect(parsed.items[0]).toMatchObject({
      medicationName: "Medication",
      dosage: null,
      instructions: "Use as written",
    });
  });

  it("rejects unexpected lifecycle fields and mixed source identities", () => {
    expect(
      prescriptionCreationInputSchema.safeParse({
        patientId: "10000000-0000-4000-8000-000000000001",
        consultationId: "10000000-0000-4000-8000-000000000002",
      }).success,
    ).toBe(false);
    expect(
      prescriptionDraftSaveInputSchema.safeParse({
        expectedVersion: 1,
        consultationId: null,
        items: [],
        status: "FINALIZED",
      }).success,
    ).toBe(false);
    expect(
      prescriptionDraftSaveInputSchema.safeParse({
        expectedVersion: 1,
        consultationId: null,
        items: [{ medicationName: "x", unknown: "no" }],
      }).success,
    ).toBe(false);
  });
});
