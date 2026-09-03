"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AppointmentStatus } from "@/modules/appointments/validation";

const labels: Readonly<Record<AppointmentStatus, string>> = {
  SCHEDULED: "Scheduled",
  ARRIVED: "Mark arrived",
  IN_CONSULTATION: "Start visit",
  COMPLETED: "Complete",
  CANCELLED: "Cancel",
  NO_SHOW: "Mark no-show",
};

type Props = Readonly<{
  appointmentId: string;
  version: number;
  status: AppointmentStatus;
  allowedTransitions: readonly AppointmentStatus[];
  compact?: boolean;
}>;

export function AppointmentActions({
  appointmentId,
  version,
  status,
  allowedTransitions,
  compact = false,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<AppointmentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function transition(targetStatus: AppointmentStatus) {
    if (pending) return;
    if (targetStatus === "CANCELLED" && !window.confirm("Cancel this appointment?")) return;
    setPending(targetStatus);
    setError(null);
    try {
      const response = await fetch(`/api/appointments/${appointmentId}/transition`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatus, expectedVersion: version }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          result &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Unable to change the appointment status.";
        setError(message);
        return;
      }
      router.refresh();
    } catch {
      setError("Unable to change the appointment status.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {status === "SCHEDULED" ? (
          <Link
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            href={`/appointments/${appointmentId}/edit`}
          >
            Reschedule
          </Link>
        ) : null}
        {allowedTransitions.map((target) => (
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
              target === "CANCELLED"
                ? "border border-red-300 text-red-800 hover:bg-red-50"
                : "border border-slate-300 hover:bg-slate-50"
            }`}
            disabled={pending !== null}
            key={target}
            onClick={() => transition(target)}
            type="button"
          >
            {pending === target ? "Saving…" : labels[target]}
          </button>
        ))}
        {compact ? (
          <Link
            className="px-2 py-1.5 text-sm font-medium text-teal-800 hover:underline"
            href={`/appointments/${appointmentId}`}
          >
            Details
          </Link>
        ) : null}
      </div>
      {error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
