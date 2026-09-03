import { describe, expect, it } from "vitest";

import { getCapabilitiesForRole, hasCapability } from "./capabilities";

describe("capability policy", () => {
  it("grants doctors staff administration and clinical capabilities", () => {
    expect(hasCapability("DOCTOR", "users.manage_secretaries")).toBe(true);
    expect(hasCapability("DOCTOR", "clinical_notes.read")).toBe(true);
    expect(getCapabilitiesForRole("DOCTOR")).toContain("prescriptions.finalize");
  });

  it("limits secretaries to the authenticated shell and administrative workflows", () => {
    expect(hasCapability("SECRETARY", "shell.access")).toBe(true);
    expect(hasCapability("SECRETARY", "patients.read_administrative")).toBe(true);
    expect(hasCapability("SECRETARY", "appointments.update")).toBe(true);
    expect(hasCapability("SECRETARY", "users.manage_secretaries")).toBe(false);
    expect(hasCapability("SECRETARY", "consultations.read")).toBe(false);
    expect(hasCapability("SECRETARY", "clinical_notes.read")).toBe(false);
    expect(hasCapability("SECRETARY", "followups.read_sensitive")).toBe(false);
    expect(hasCapability("SECRETARY", "prescriptions.read")).toBe(false);
  });
});
