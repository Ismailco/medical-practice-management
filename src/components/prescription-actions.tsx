"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PrescriptionActions({
  id,
  status,
  version,
  prescriptionNumber,
}: Readonly<{
  id: string;
  status: "DRAFT" | "FINALIZED" | "VOID";
  version: number;
  prescriptionNumber: string | null;
}>) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/prescriptions/${id}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const result = (await response.json()) as { error?: string; prescription?: { id: string } };
      if (!response.ok) throw new Error(result.error ?? "The prescription operation failed.");
      if (result.prescription?.id && path === "duplicate")
        router.push(`/prescriptions/${result.prescription.id}`);
      else if (result.prescription?.id && path === "replace")
        router.push(`/prescriptions/${result.prescription.id}`);
      else router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The prescription operation failed.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "DRAFT") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-md bg-teal-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "Finalizing issues this prescription and locks its contents. Corrections require a new replacement prescription.",
              )
            ) {
              void call("finalize", { expectedVersion: version });
            }
          }}
          type="button"
        >
          Finalize prescription
        </button>
        <button
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Discard this draft? It has not been issued."))
              void call("discard", { expectedVersion: version });
          }}
          type="button"
        >
          Discard draft
        </button>
        {error ? <p className="basis-full text-sm text-red-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === "FINALIZED" ? (
        <button
          className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-800 disabled:opacity-50"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                `Void ${prescriptionNumber ?? "this prescription"}? It will remain in history.`,
              )
            ) {
              void call("void", { expectedVersion: version });
            }
          }}
          type="button"
        >
          Void prescription
        </button>
      ) : null}
      <>
        <button
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
          disabled={busy}
          onClick={() => void call("duplicate")}
          type="button"
        >
          Duplicate as draft
        </button>
        <button
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
          disabled={busy}
          onClick={() => void call("replace")}
          type="button"
        >
          Create replacement
        </button>
      </>
      {error ? <p className="basis-full text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
