"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Source =
  | Readonly<{ patientId: string; consultationId?: never }>
  | Readonly<{ patientId?: never; consultationId: string }>;

function readError(value: unknown): string {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string"
    ? value.error
    : "Unable to create the follow-up.";
}

export function FollowUpCreateForm(source: Source) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(source.consultationId
            ? { consultationId: source.consultationId }
            : { patientId: source.patientId }),
          dueDate: form.get("dueDate"),
          reason: form.get("reason"),
        }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(readError(result));
        return;
      }
      if (
        result &&
        typeof result === "object" &&
        "followUp" in result &&
        result.followUp &&
        typeof result.followUp === "object" &&
        "id" in result.followUp &&
        typeof result.followUp.id === "string"
      ) {
        router.push(`/follow-ups/${result.followUp.id}`);
      }
      router.refresh();
    } catch {
      setMessage("Unable to create the follow-up.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="mt-4 grid gap-4 rounded-lg border border-slate-200 bg-white p-5"
      onSubmit={submit}
    >
      <div>
        <label
          className="block text-sm font-medium text-slate-800"
          htmlFor={`follow-up-date-${source.consultationId ?? source.patientId}`}
        >
          Due date
        </label>
        <input
          className="mt-1.5 rounded-md border border-slate-300 px-3 py-2"
          id={`follow-up-date-${source.consultationId ?? source.patientId}`}
          name="dueDate"
          required
          type="date"
        />
      </div>
      <div>
        <label
          className="block text-sm font-medium text-slate-800"
          htmlFor={`follow-up-reason-${source.consultationId ?? source.patientId}`}
        >
          Sensitive follow-up reason
        </label>
        <textarea
          className="mt-1.5 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2"
          id={`follow-up-reason-${source.consultationId ?? source.patientId}`}
          maxLength={2000}
          name="reason"
          required
        />
      </div>
      {message ? (
        <p className="text-sm text-red-700" role="alert">
          {message}
        </p>
      ) : null}
      <button
        className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Creating…" : "Create follow-up"}
      </button>
    </form>
  );
}
