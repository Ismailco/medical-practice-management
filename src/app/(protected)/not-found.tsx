import Link from "next/link";

export default function ProtectedNotFound() {
  return (
    <section className="max-w-xl">
      <h1 className="text-2xl font-semibold text-slate-950">Record not found</h1>
      <p className="mt-3 text-slate-600">
        The record is unavailable or you do not have access to it.
      </p>
      <Link
        className="mt-6 inline-block font-medium text-teal-800 hover:underline"
        href="/dashboard"
      >
        Return to the dashboard
      </Link>
    </section>
  );
}
