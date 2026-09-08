"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function FollowUpEditor({
  id,
  dueDate,
  reason,
  version,
}: Readonly<{ id: string; dueDate: string; reason: string; version: number }>) {
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
      const response = await fetch(`/api/follow-ups/${id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: version,
          dueDate: form.get("dueDate"),
          reason: form.get("reason"),
        }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(
          result &&
            typeof result === "object" &&
            "error" in result &&
            typeof result.error === "string"
            ? result.error
            : "Unable to update the follow-up.",
        );
        return;
      }
      router.refresh();
    } catch {
      setMessage("Unable to update the follow-up.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <label className="block text-sm font-medium" htmlFor="follow-up-due-date">
          Due date
        </label>
        <input
          className="mt-1.5 rounded-md border border-slate-300 px-3 py-2"
          defaultValue={dueDate}
          id="follow-up-due-date"
          name="dueDate"
          required
          type="date"
        />
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="follow-up-reason">
          Sensitive follow-up reason
        </label>
        <textarea
          className="mt-1.5 min-h-28 w-full rounded-md border border-slate-300 px-3 py-2"
          defaultValue={reason}
          id="follow-up-reason"
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
        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
