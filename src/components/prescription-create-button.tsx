"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PrescriptionCreateButton({
  patientId,
  consultationId,
}: Readonly<{ patientId?: string; consultationId?: string }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patientId ? { patientId } : { consultationId }),
      });
      const result = (await response.json()) as { error?: string; prescription?: { id: string } };
      if (!response.ok || !result.prescription)
        throw new Error(result.error ?? "The prescription draft could not be created.");
      router.push(`/prescriptions/${result.prescription.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The prescription draft could not be created.",
      );
      setBusy(false);
    }
  }
  return (
    <span>
      <button
        className="rounded-md bg-teal-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        disabled={busy || (!patientId && !consultationId)}
        onClick={() => void create()}
        type="button"
      >
        New prescription draft
      </button>
      {error ? <span className="ml-3 text-sm text-red-700">{error}</span> : null}
    </span>
  );
}
