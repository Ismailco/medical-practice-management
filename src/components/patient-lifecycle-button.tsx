"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { readPatientError } from "@/modules/patients/client-response";

type Props = Readonly<{
  patientId: string;
  patientNumber: string;
  version: number;
  archived: boolean;
}>;

export function PatientLifecycleButton({ patientId, patientNumber, version, archived }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = archived ? "restore" : "archive";

  async function changeState() {
    const confirmed = window.confirm(
      archived
        ? `Restore patient ${patientNumber} to the active list?`
        : `Archive patient ${patientNumber}? The record will remain preserved.`,
    );
    if (!confirmed) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/patients/${patientId}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, expectedVersion: version }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(readPatientError(result).message);
        return;
      }
      router.refresh();
    } catch {
      setError(`Unable to ${action} the patient. Please try again.`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        className={
          archived
            ? "rounded-md border border-teal-700 px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-50"
            : "rounded-md border border-amber-600 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
        }
        disabled={pending}
        onClick={changeState}
        type="button"
      >
        {pending ? "Working…" : archived ? "Restore patient" : "Archive patient"}
      </button>
      {error ? (
        <p aria-live="polite" className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
