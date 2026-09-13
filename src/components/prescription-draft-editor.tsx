"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Item = {
  medicationName: string;
  dosage: string | null;
  form: string | null;
  frequency: string | null;
  duration: string | null;
  quantity: string | null;
  route: string | null;
  instructions: string | null;
};

const blankItem = (): Item => ({
  medicationName: "",
  dosage: null,
  form: null,
  frequency: null,
  duration: null,
  quantity: null,
  route: null,
  instructions: null,
});

export function PrescriptionDraftEditor({
  id,
  version,
  consultationId,
  initialItems,
}: Readonly<{
  id: string;
  version: number;
  consultationId: string | null;
  initialItems: readonly Item[];
}>) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initialItems.map((item) => ({ ...item })));
  const [linkedConsultation, setLinkedConsultation] = useState(consultationId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busyAction, setBusyAction] = useState<"save" | "finalize" | "discard" | null>(null);
  const [confirmAction, setConfirmAction] = useState<"finalize" | "discard" | null>(null);
  const busy = busyAction !== null;

  function updateItem(index: number, field: keyof Item, value: string) {
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  }

  function moveItem(from: number, to: number) {
    setItems((current) => {
      const next = [...current];
      const source = next[from];
      const target = next[to];
      if (!source || !target) return current;
      next[from] = target;
      next[to] = source;
      return next;
    });
  }

  async function save() {
    setBusyAction("save");
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/prescriptions/${id}/save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: version,
          consultationId: linkedConsultation || null,
          items,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The draft could not be saved.");
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The draft could not be saved.");
    } finally {
      setBusyAction(null);
    }
  }

  async function callAction(path: "finalize" | "discard") {
    setBusyAction(path);
    setError(null);
    try {
      const response = await fetch(`/api/prescriptions/${id}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: version }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The prescription operation failed.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The prescription operation failed.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="prescription-draft-editor mt-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">Prescription items</h2>
        <Button onClick={() => setItems((current) => [...current, blankItem()])} type="button">
          Add item
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="callout callout-warning">
          <strong>No medication items yet.</strong> Add at least one item before finalizing.
        </p>
      ) : null}
      {items.map((item, index) => (
        <fieldset className="surface p-4" key={index}>
          <legend className="px-2 text-sm font-semibold text-slate-700">Item {index + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                "medicationName",
                "dosage",
                "form",
                "frequency",
                "duration",
                "quantity",
                "route",
              ] as const
            ).map((field) => (
              <label className="text-sm text-slate-700" key={field}>
                <span className="block font-medium">
                  {field === "medicationName"
                    ? "Medication"
                    : field.charAt(0).toUpperCase() + field.slice(1)}
                </span>
                <input
                  className="field-control mt-1"
                  required={field === "medicationName"}
                  value={item[field] ?? ""}
                  onChange={(event) => updateItem(index, field, event.target.value)}
                />
              </label>
            ))}
            <label className="text-sm text-slate-700 sm:col-span-2">
              <span className="block font-medium">Instructions</span>
              <textarea
                className="field-control mt-1 min-h-20"
                value={item.instructions ?? ""}
                onChange={(event) => updateItem(index, "instructions", event.target.value)}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded border border-slate-300 px-2 py-1 text-xs"
              disabled={index === 0}
              onClick={() => moveItem(index, index - 1)}
              type="button"
            >
              Move up
            </button>
            <button
              className="rounded border border-slate-300 px-2 py-1 text-xs"
              disabled={index === items.length - 1}
              onClick={() => moveItem(index, index + 1)}
              type="button"
            >
              Move down
            </button>
            <button
              className="rounded border border-red-300 px-2 py-1 text-xs text-red-800"
              onClick={() =>
                setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
              }
              type="button"
            >
              Remove
            </button>
          </div>
        </fieldset>
      ))}
      <label className="block text-sm text-slate-700">
        <span className="font-medium">Consultation ID (optional)</span>
        <input
          className="field-control mt-1"
          value={linkedConsultation}
          onChange={(event) => setLinkedConsultation(event.target.value)}
        />
      </label>
      <div aria-live="polite" className="sticky-actions prescription-draft-actions">
        <div className="prescription-draft-primary-actions">
          <Button disabled={busy} onClick={() => void save()} type="button" variant="primary">
            {busyAction === "save" ? "Saving…" : "Save draft"}
          </Button>
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setConfirmAction("finalize")}
            type="button"
          >
            {busyAction === "finalize" ? "Finalizing…" : "Finalize prescription"}
          </button>
        </div>
        <button
          className="btn btn-danger prescription-draft-discard"
          disabled={busy}
          onClick={() => setConfirmAction("discard")}
          type="button"
        >
          {busyAction === "discard" ? "Discarding…" : "Discard draft"}
        </button>
        {saved ? <span className="text-sm text-teal-800">Draft saved.</span> : null}
        {error ? (
          <p className="basis-full text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <ConfirmDialog
          confirmLabel={confirmAction === "discard" ? "Discard draft" : "Finalize prescription"}
          danger={confirmAction === "discard"}
          description={
            confirmAction === "discard"
              ? "This draft has not been issued and will be removed from active work."
              : "Issuing the prescription locks its contents. Corrections require a new replacement prescription."
          }
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            const action = confirmAction;
            setConfirmAction(null);
            if (action) void callAction(action);
          }}
          open={confirmAction !== null}
          title={
            confirmAction === "discard" ? "Discard this draft?" : "Finalize this prescription?"
          }
        />
      </div>
    </div>
  );
}
