"use client";

import Link from "next/link";

export default function ProtectedError() {
  return (
    <section className="max-w-xl">
      <h1 className="text-2xl font-semibold text-slate-950">We could not load this workspace</h1>
      <p className="mt-3 text-slate-600">Try again, or return to the dashboard.</p>
      <div className="mt-6 flex gap-4">
        <button
          className="rounded-lg bg-teal-800 px-4 py-2 font-medium text-white"
          onClick={() => window.location.reload()}
          type="button"
        >
          Try again
        </button>
        <Link
          className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-800"
          href="/dashboard"
        >
          Dashboard
        </Link>
      </div>
    </section>
  );
}
