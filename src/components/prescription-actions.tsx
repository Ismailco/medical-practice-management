"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
  const [confirmAction, setConfirmAction] = useState<"finalize" | "discard" | "void" | null>(null);

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
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === "FINALIZED" ? (
        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={() => setConfirmAction("void")}
          type="button"
        >
          Void prescription
        </button>
      ) : null}
      <>
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void call("duplicate")}
          type="button"
        >
          Duplicate as draft
        </button>
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void call("replace")}
          type="button"
        >
          Create replacement
        </button>
      </>
      {error ? <p className="basis-full text-sm text-red-700">{error}</p> : null}
      <ConfirmDialog
        confirmLabel={
          confirmAction === "void"
            ? "Void prescription"
            : confirmAction === "discard"
              ? "Discard draft"
              : "Finalize prescription"
        }
        danger={confirmAction === "void" || confirmAction === "discard"}
        description={
          confirmAction === "void"
            ? `${prescriptionNumber ?? "This prescription"} remains in history but is marked not valid for use.`
            : confirmAction === "discard"
              ? "This draft has not been issued and will be removed from active work."
              : "Issuing the prescription locks its contents. Corrections require a new replacement prescription."
        }
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          const action = confirmAction;
          setConfirmAction(null);
          if (action) void call(action, { expectedVersion: version });
        }}
        open={confirmAction !== null}
        title={
          confirmAction === "void"
            ? `Void ${prescriptionNumber ?? "prescription"}?`
            : confirmAction === "discard"
              ? "Discard this draft?"
              : "Finalize this prescription?"
        }
      />
    </div>
  );
}
