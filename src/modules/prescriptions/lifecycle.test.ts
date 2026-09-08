import { describe, expect, it } from "vitest";
import { canTransitionPrescription, prescriptionTransitions } from "./lifecycle";

describe("prescription lifecycle", () => {
  it("documents the terminal transitions", () => {
    expect(prescriptionTransitions("DRAFT")).toEqual(["FINALIZED"]);
    expect(prescriptionTransitions("FINALIZED")).toEqual(["VOID"]);
    expect(prescriptionTransitions("VOID")).toEqual([]);
    expect(canTransitionPrescription("DRAFT", "FINALIZED")).toBe(true);
    expect(canTransitionPrescription("FINALIZED", "DRAFT")).toBe(false);
  });
});
