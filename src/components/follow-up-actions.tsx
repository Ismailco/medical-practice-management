"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function FollowUpActions({ id, version }: Readonly<{ id: string; version: number }>) {
  const router = useRouter();
  const [pending, setPending] = useState<"complete" | "cancel" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function transition(action: "complete" | "cancel") {
    if (pending) return;
    if (action === "cancel" && !window.confirm("Cancel this follow-up?")) return;
    setPending(action);
    setMessage(null);
    try {
      const response = await fetch(`/api/follow-ups/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: version }),
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
      setPending(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-md bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={pending !== null}
          onClick={() => transition("complete")}
          type="button"
        >
          {pending === "complete" ? "Completing…" : "Mark complete"}
        </button>
        <button
          className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
          disabled={pending !== null}
          onClick={() => transition("cancel")}
          type="button"
        >
          {pending === "cancel" ? "Cancelling…" : "Cancel follow-up"}
        </button>
      </div>
      {message ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
