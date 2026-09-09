import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold text-slate-950">Page not found</h1>
      <p className="mt-3 text-slate-600">
        That page is unavailable or you do not have access to it.
      </p>
      <Link className="mt-6 font-medium text-teal-800 hover:underline" href="/dashboard">
        Return to the dashboard
      </Link>
    </main>
  );
}
