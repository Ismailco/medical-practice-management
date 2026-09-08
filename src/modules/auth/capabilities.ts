import type { user } from "@/db/schema";

export type StaffRole = typeof user.$inferSelect.role;

export const capabilities = [
  "shell.access",
  "users.manage_secretaries",
  "patients.read_administrative",
  "patients.create",
  "patients.update_administrative",
  "patients.archive",
  "patients.restore",
  "appointments.read",
  "appointments.create",
  "appointments.update",
  "appointments.transition",
  "appointments.transition_visit",
  "consultations.read",
  "consultations.write",
  "consultations.finalize",
  "clinical_notes.read",
  "clinical_notes.write",
  "clinical_notes.addendum",
  "followups.read_sensitive",
  "followups.create",
  "followups.update",
  "followups.transition",
  "prescriptions.read",
  "prescriptions.create",
  "prescriptions.update_draft",
  "prescriptions.finalize",
  "prescriptions.duplicate",
  "prescriptions.replace",
  "prescriptions.void",
  "practice_profile.manage",
  "audit.read",
] as const;

export type Capability = (typeof capabilities)[number];

const secretaryCapabilities = new Set<Capability>([
  "shell.access",
  "patients.read_administrative",
  "patients.create",
  "patients.update_administrative",
  "appointments.read",
  "appointments.create",
  "appointments.update",
  "appointments.transition",
]);

const doctorCapabilities = new Set<Capability>(capabilities);

const roleCapabilities: Readonly<Record<StaffRole, ReadonlySet<Capability>>> = {
  DOCTOR: doctorCapabilities,
  SECRETARY: secretaryCapabilities,
};

export function hasCapability(role: StaffRole, capability: Capability): boolean {
  return roleCapabilities[role].has(capability);
}

export function getCapabilitiesForRole(role: StaffRole): readonly Capability[] {
  return capabilities.filter((capability) => hasCapability(role, capability));
}
