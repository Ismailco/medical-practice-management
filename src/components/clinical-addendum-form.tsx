"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function ClinicalAddendumForm({ consultationId }: { consultationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);
    const form = event.currentTarget;
    const content = new FormData(form).get("content");
    try {
      const response = await fetch(`/api/consultations/${consultationId}/addenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(
          result &&
            typeof result === "object" &&
            "error" in result &&
            typeof result.error === "string"
            ? result.error
            : "Unable to add the addendum.",
        );
        return;
      }
      form.reset();
      router.refresh();
    } catch {
      setMessage("Unable to add the addendum.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-4" onSubmit={submit}>
      <label className="block text-sm font-medium text-slate-800" htmlFor="addendum-content">
        New addendum
      </label>
      <textarea
        className="field-control mt-1.5 min-h-28"
        id="addendum-content"
        maxLength={20000}
        name="content"
        required
      />
      <p className="callout callout-warning mt-3">
        Addenda are permanent. Correct an error with another addendum.
      </p>
      {message ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {message}
        </p>
      ) : null}
      <button className="btn btn-secondary mt-3" disabled={pending} type="submit">
        {pending ? "Adding…" : "Add addendum"}
      </button>
    </form>
  );
}
