"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type RevisionValues = Readonly<{
  reasonForVisit: string | null;
  observations: string | null;
  diagnosis: string | null;
  notes: string | null;
}>;

type Props = Readonly<{
  consultationId: string;
  version: number;
  revisionNumber: number;
  current?: RevisionValues;
}>;

function readError(value: unknown, fallback: string): string {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string"
    ? value.error
    : fallback;
}

export function ConsultationEditor({ consultationId, version, revisionNumber, current }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<"save" | "finalize" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending("save");
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/consultations/${consultationId}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: version,
          reasonForVisit: form.get("reasonForVisit"),
          observations: form.get("observations"),
          diagnosis: form.get("diagnosis"),
          notes: form.get("notes"),
        }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(readError(result, "Unable to save this revision."));
        return;
      }
      router.refresh();
    } catch {
      setMessage("Unable to save this revision.");
    } finally {
      setPending(null);
    }
  }

  async function finalize() {
    if (pending || revisionNumber < 1) return;
    if (
      !window.confirm(
        "Finalizing locks this consultation. Further corrections must be added as addenda. Finalize now?",
      )
    ) {
      return;
    }
    setPending("finalize");
    setMessage(null);
    try {
      const response = await fetch(`/api/consultations/${consultationId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: version }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(readError(result, "Unable to finalize this consultation."));
        return;
      }
      router.refresh();
    } catch {
      setMessage("Unable to finalize this consultation.");
    } finally {
      setPending(null);
    }
  }

  const inputClass =
    "mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100";
  return (
    <form className="space-y-6" noValidate onSubmit={save}>
      <div>
        <label className="block text-sm font-medium text-slate-800" htmlFor="reasonForVisit">
          Reason for visit
        </label>
        <textarea
          className={`${inputClass} min-h-24`}
          defaultValue={current?.reasonForVisit ?? ""}
          id="reasonForVisit"
          maxLength={2000}
          name="reasonForVisit"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-800" htmlFor="observations">
          Observations
        </label>
        <textarea
          className={`${inputClass} min-h-36`}
          defaultValue={current?.observations ?? ""}
          id="observations"
          maxLength={10000}
          name="observations"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-800" htmlFor="diagnosis">
          Diagnosis
        </label>
        <textarea
          className={`${inputClass} min-h-24`}
          defaultValue={current?.diagnosis ?? ""}
          id="diagnosis"
          maxLength={4000}
          name="diagnosis"
        />
        <p className="mt-1 text-xs text-slate-500">
          Documentation only. The application does not suggest diagnoses.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-800" htmlFor="notes">
          Clinical notes
        </label>
        <textarea
          className={`${inputClass} min-h-48`}
          defaultValue={current?.notes ?? ""}
          id="notes"
          maxLength={20000}
          name="notes"
        />
      </div>
      {message ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {message}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-5">
        <button
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
          disabled={pending !== null}
          type="submit"
        >
          {pending === "save" ? "Saving…" : "Save revision"}
        </button>
        <button
          className="rounded-md bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50"
          disabled={pending !== null || revisionNumber < 1}
          onClick={finalize}
          type="button"
        >
          {pending === "finalize" ? "Finalizing…" : "Finalize consultation"}
        </button>
      </div>
      {revisionNumber < 1 ? (
        <p className="text-xs text-slate-500">Save at least one revision before finalizing.</p>
      ) : null}
    </form>
  );
}
