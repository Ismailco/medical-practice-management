import type { FollowUpStatus } from "./validation";

const transitions: Readonly<Record<FollowUpStatus, readonly FollowUpStatus[]>> = {
  PENDING: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionFollowUp(from: FollowUpStatus, to: FollowUpStatus): boolean {
  return transitions[from].includes(to);
}

export function followUpTransitions(from: FollowUpStatus): readonly FollowUpStatus[] {
  return transitions[from];
}

export function isTerminalFollowUpStatus(status: FollowUpStatus): boolean {
  return transitions[status].length === 0;
}
