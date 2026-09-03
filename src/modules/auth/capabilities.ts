import type { user } from "@/db/schema";

export type StaffRole = typeof user.$inferSelect.role;

export const capabilities = [
  "shell.access",
  "users.manage_secretaries",
  "patients.read_administrative",
  "patients.create",
  "patients.update_administrative",
  "appointments.read",
  "appointments.create",
  "appointments.update",
  "consultations.read",
  "consultations.write",
  "clinical_notes.read",
  "clinical_notes.write",
  "followups.read_sensitive",
  "followups.write",
  "prescriptions.read",
  "prescriptions.write",
  "prescriptions.finalize",
  "prescriptions.print",
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
