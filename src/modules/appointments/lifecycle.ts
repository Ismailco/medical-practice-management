import type { Capability, StaffRole } from "@/modules/auth/capabilities";
import type { AppointmentStatus } from "./validation";

const transitions: Readonly<Record<AppointmentStatus, readonly AppointmentStatus[]>> = {
  SCHEDULED: ["ARRIVED", "CANCELLED", "NO_SHOW"],
  ARRIVED: ["IN_CONSULTATION", "CANCELLED"],
  IN_CONSULTATION: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return transitions[from].includes(to);
}

export function transitionCapability(to: AppointmentStatus): Capability {
  return to === "IN_CONSULTATION" || to === "COMPLETED"
    ? "appointments.transition_visit"
    : "appointments.transition";
}

export function canRoleTransition(
  role: StaffRole,
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  if (!canTransition(from, to)) return false;
  return transitionCapability(to) === "appointments.transition" || role === "DOCTOR";
}

export function allowedTransitions(
  role: StaffRole,
  from: AppointmentStatus,
): readonly AppointmentStatus[] {
  return transitions[from].filter((to) => canRoleTransition(role, from, to));
}

export function isTerminalStatus(status: AppointmentStatus): boolean {
  return transitions[status].length === 0;
}
