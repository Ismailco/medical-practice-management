"use client";

export default function FollowUpsError({ reset }: { reset: () => void }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">Follow-ups unavailable</h1>
      <p className="mt-2 text-sm text-slate-600">The clinical workflow could not be loaded.</p>
      <button
        className="mt-4 rounded-md border px-3 py-2 text-sm font-medium"
        onClick={reset}
        type="button"
      >
        Try again
      </button>
    </section>
  );
}
