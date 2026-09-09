"use client";

import { useState } from "react";

export function PrescriptionPdfButton({
  prescriptionId,
  voided,
}: Readonly<{ prescriptionId: string; voided: boolean }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPdf() {
    setBusy(true);
    setError(null);
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setError("Allow pop-ups to view the prescription PDF.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch(`/api/prescriptions/${prescriptionId}/pdf`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        popup.close();
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "The prescription PDF could not be generated.");
      }
      const pdfBlob = new Blob([await response.arrayBuffer()], { type: "application/pdf" });
      const url = URL.createObjectURL(pdfBlob);
      popup.location.href = url;
      popup.opener = null;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      popup.close();
      setError(
        cause instanceof Error ? cause.message : "The prescription PDF could not be generated.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        disabled={busy}
        onClick={openPdf}
        type="button"
      >
        {busy ? "Preparing PDF…" : voided ? "View historical PDF" : "View / Print PDF"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
