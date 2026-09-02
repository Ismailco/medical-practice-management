const foundationItems = [
  "Next.js App Router and strict TypeScript",
  "Validated server-only environment configuration",
  "PostgreSQL and Drizzle migration tooling",
  "Liveness and database readiness endpoints",
  "Security, architecture, and contributor documentation",
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm md:p-12">
        <p className="mb-3 text-sm font-semibold tracking-wider text-[var(--accent)] uppercase">
          Phase 0 foundation
        </p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Clinic Management</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
          The technical foundation is being built for an open-source small-clinic application. No
          patient or clinical workflows have been implemented yet.
        </p>

        <div className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <strong>Demo data only.</strong> This repository and any public demonstration must never
          contain real patient information.
        </div>

        <h2 className="mt-10 text-lg font-semibold">Foundation scope</h2>
        <ul className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
          {foundationItems.map((item) => (
            <li key={item} className="rounded-lg border border-[var(--border)] px-4 py-3">
              {item}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
