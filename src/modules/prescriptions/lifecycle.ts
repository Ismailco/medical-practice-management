import type { PrescriptionStatus } from "./validation";

const transitions: Readonly<Record<PrescriptionStatus, readonly PrescriptionStatus[]>> = {
  DRAFT: ["FINALIZED"],
  FINALIZED: ["VOID"],
  VOID: [],
};

export function canTransitionPrescription(
  from: PrescriptionStatus,
  to: PrescriptionStatus,
): boolean {
  return transitions[from].includes(to);
}

export function prescriptionTransitions(from: PrescriptionStatus): readonly PrescriptionStatus[] {
  return transitions[from];
}
