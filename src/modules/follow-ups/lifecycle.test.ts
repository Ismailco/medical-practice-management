import { describe, expect, it } from "vitest";

import { canTransitionFollowUp, followUpTransitions, isTerminalFollowUpStatus } from "./lifecycle";

describe("follow-up lifecycle", () => {
  it("allows only pending completion and cancellation", () => {
    expect(followUpTransitions("PENDING")).toEqual(["COMPLETED", "CANCELLED"]);
    expect(canTransitionFollowUp("PENDING", "COMPLETED")).toBe(true);
    expect(canTransitionFollowUp("PENDING", "CANCELLED")).toBe(true);
  });

  it("makes completed and cancelled states terminal", () => {
    for (const terminal of ["COMPLETED", "CANCELLED"] as const) {
      expect(isTerminalFollowUpStatus(terminal)).toBe(true);
      expect(followUpTransitions(terminal)).toEqual([]);
      expect(canTransitionFollowUp(terminal, "PENDING")).toBe(false);
    }
  });
});
