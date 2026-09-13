"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AppointmentStatus } from "@/modules/appointments/validation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function transition(targetStatus: AppointmentStatus) {
    if (pending) return;
    setPending(targetStatus);
    setError(null);
    try {
      const startingConsultation = targetStatus === "IN_CONSULTATION";
      const response = await fetch(
        startingConsultation
          ? "/api/consultations/from-appointment"
          : `/api/appointments/${appointmentId}/transition`,
        {
          method: startingConsultation ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            startingConsultation
              ? { appointmentId, expectedAppointmentVersion: version }
              : { targetStatus, expectedVersion: version },
          ),
        },
      );
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
      if (
        startingConsultation &&
        result &&
        typeof result === "object" &&
        "consultation" in result &&
        result.consultation &&
        typeof result.consultation === "object" &&
        "id" in result.consultation &&
        typeof result.consultation.id === "string"
      ) {
        router.push(`/consultations/${result.consultation.id}`);
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
                ? "btn btn-danger"
                : target === "ARRIVED" || target === "IN_CONSULTATION"
                  ? "btn btn-primary"
                  : "btn btn-secondary"
            }`}
            disabled={pending !== null}
            key={target}
            onClick={() =>
              target === "CANCELLED" ? setConfirmCancel(true) : void transition(target)
            }
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
      <ConfirmDialog
        confirmLabel="Cancel appointment"
        danger
        description="The appointment will remain in history with its cancelled status."
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          void transition("CANCELLED");
        }}
        open={confirmCancel}
        title="Cancel this appointment?"
      />
    </div>
  );
}
