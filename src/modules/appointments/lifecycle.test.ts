import { describe, expect, it } from "vitest";

import {
  allowedTransitions,
  canRoleTransition,
  canTransition,
  isTerminalStatus,
} from "./lifecycle";
import type { AppointmentStatus } from "./validation";

const statuses: AppointmentStatus[] = [
  "SCHEDULED",
  "ARRIVED",
  "IN_CONSULTATION",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

describe("appointment lifecycle", () => {
  it("implements the strict transition matrix", () => {
    expect(allowedTransitions("DOCTOR", "SCHEDULED")).toEqual(["ARRIVED", "CANCELLED", "NO_SHOW"]);
    expect(allowedTransitions("DOCTOR", "ARRIVED")).toEqual(["IN_CONSULTATION", "CANCELLED"]);
    expect(allowedTransitions("DOCTOR", "IN_CONSULTATION")).toEqual(["COMPLETED"]);
    expect(canTransition("SCHEDULED", "COMPLETED")).toBe(false);
    expect(canTransition("ARRIVED", "NO_SHOW")).toBe(false);
  });

  it("reserves visit transitions for doctors", () => {
    expect(canRoleTransition("SECRETARY", "SCHEDULED", "ARRIVED")).toBe(true);
    expect(canRoleTransition("SECRETARY", "SCHEDULED", "NO_SHOW")).toBe(true);
    expect(canRoleTransition("SECRETARY", "ARRIVED", "CANCELLED")).toBe(true);
    expect(canRoleTransition("SECRETARY", "ARRIVED", "IN_CONSULTATION")).toBe(false);
    expect(canRoleTransition("SECRETARY", "IN_CONSULTATION", "COMPLETED")).toBe(false);
    expect(canRoleTransition("DOCTOR", "ARRIVED", "IN_CONSULTATION")).toBe(true);
    expect(canRoleTransition("DOCTOR", "IN_CONSULTATION", "COMPLETED")).toBe(true);
  });

  it("makes completed, cancelled, and no-show terminal", () => {
    for (const terminal of ["COMPLETED", "CANCELLED", "NO_SHOW"] as const) {
      expect(isTerminalStatus(terminal)).toBe(true);
      for (const target of statuses) expect(canTransition(terminal, target)).toBe(false);
    }
  });
});
