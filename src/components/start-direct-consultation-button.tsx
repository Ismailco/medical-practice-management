"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartDirectConsultationButton({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId }),
      });
      const body: unknown = await response.json().catch(() => null);
      const id =
        body &&
        typeof body === "object" &&
        "consultation" in body &&
        body.consultation &&
        typeof body.consultation === "object" &&
        "id" in body.consultation &&
        typeof body.consultation.id === "string"
          ? body.consultation.id
          : null;
      if (!response.ok || !id) {
        setError(
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Unable to start the consultation.",
        );
        return;
      }
      router.push(`/consultations/${id}`);
      router.refresh();
    } catch {
      setError("Unable to start the consultation.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <button
        className="rounded-md bg-teal-800 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50"
        disabled={pending}
        onClick={start}
        type="button"
      >
        {pending ? "Starting…" : "Start direct consultation"}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
