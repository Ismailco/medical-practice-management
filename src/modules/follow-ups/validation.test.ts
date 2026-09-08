import { describe, expect, it } from "vitest";

import { followUpCreationInputSchema, followUpUpdateInputSchema } from "./validation";

describe("follow-up validation", () => {
  it("accepts either a patient or consultation creation source", () => {
    expect(
      followUpCreationInputSchema.parse({
        patientId: "10000000-0000-4000-8000-000000000001",
        dueDate: "2026-09-10",
        reason: "  Review response  ",
      }),
    ).toMatchObject({ reason: "Review response" });
    expect(
      followUpCreationInputSchema.parse({
        consultationId: "10000000-0000-4000-8000-000000000002",
        dueDate: "2026-09-10",
        reason: "Reassessment",
      }),
    ).toHaveProperty("consultationId");
  });

  it("rejects invalid dates, empty reasons, mixed identities, and assigned lifecycle data", () => {
    for (const input of [
      {
        patientId: "10000000-0000-4000-8000-000000000001",
        dueDate: "2026-02-30",
        reason: "Review",
      },
      {
        patientId: "10000000-0000-4000-8000-000000000001",
        dueDate: "2026-09-10",
        reason: "   ",
      },
      {
        patientId: "10000000-0000-4000-8000-000000000001",
        consultationId: "10000000-0000-4000-8000-000000000002",
        dueDate: "2026-09-10",
        reason: "Review",
      },
      {
        patientId: "10000000-0000-4000-8000-000000000001",
        dueDate: "2026-09-10",
        reason: "Review",
        status: "COMPLETED",
      },
    ]) {
      expect(followUpCreationInputSchema.safeParse(input).success).toBe(false);
    }
  });

  it("requires optimistic concurrency for pending edits", () => {
    expect(
      followUpUpdateInputSchema.safeParse({ dueDate: "2026-09-10", reason: "Review" }).success,
    ).toBe(false);
    expect(
      followUpUpdateInputSchema.safeParse({
        expectedVersion: 1,
        dueDate: "2026-09-10",
        reason: "Review",
        createdBy: "10000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
  });
});
