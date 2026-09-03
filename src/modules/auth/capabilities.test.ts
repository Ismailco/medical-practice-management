import { describe, expect, it } from "vitest";

import { getCapabilitiesForRole, hasCapability } from "./capabilities";

describe("capability policy", () => {
  it("grants doctors staff administration and clinical capabilities", () => {
    expect(hasCapability("DOCTOR", "users.manage_secretaries")).toBe(true);
    expect(hasCapability("DOCTOR", "clinical_notes.read")).toBe(true);
    expect(getCapabilitiesForRole("DOCTOR")).toContain("prescriptions.finalize");
    expect(hasCapability("DOCTOR", "patients.archive")).toBe(true);
    expect(hasCapability("DOCTOR", "patients.restore")).toBe(true);
    expect(hasCapability("DOCTOR", "appointments.transition_visit")).toBe(true);
  });

  it("limits secretaries to the authenticated shell and administrative workflows", () => {
    expect(hasCapability("SECRETARY", "shell.access")).toBe(true);
    expect(hasCapability("SECRETARY", "patients.read_administrative")).toBe(true);
    expect(hasCapability("SECRETARY", "appointments.update")).toBe(true);
    expect(hasCapability("SECRETARY", "appointments.transition")).toBe(true);
    expect(hasCapability("SECRETARY", "appointments.transition_visit")).toBe(false);
    expect(hasCapability("SECRETARY", "users.manage_secretaries")).toBe(false);
    expect(hasCapability("SECRETARY", "patients.archive")).toBe(false);
    expect(hasCapability("SECRETARY", "patients.restore")).toBe(false);
    expect(hasCapability("SECRETARY", "consultations.read")).toBe(false);
    expect(hasCapability("SECRETARY", "clinical_notes.read")).toBe(false);
    expect(hasCapability("SECRETARY", "followups.read_sensitive")).toBe(false);
    expect(hasCapability("SECRETARY", "prescriptions.read")).toBe(false);
  });
});
