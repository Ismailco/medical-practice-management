"use client";

export default function PatientsError({ reset }: { reset: () => void }) {
  return (
    <section className="rounded-lg border border-red-200 bg-white p-8">
      <h1 className="text-xl font-semibold text-slate-950">Patient records are unavailable</h1>
      <p className="mt-2 text-sm text-slate-600">
        The records could not be loaded. No changes were made.
      </p>
      <button
        className="mt-5 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        onClick={reset}
        type="button"
      >
        Try again
      </button>
    </section>
  );
}
