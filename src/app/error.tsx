"use client";

import Link from "next/link";

export default function GlobalError() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold text-slate-950">Something went wrong</h1>
      <p className="mt-3 text-slate-600">The application could not complete that request.</p>
      <Link className="mt-6 font-medium text-teal-800 hover:underline" href="/dashboard">
        Return to the dashboard
      </Link>
    </main>
  );
}
