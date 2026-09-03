export default function PatientsLoading() {
  return (
    <section aria-busy="true" aria-label="Loading patients">
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
      <div className="mt-7 h-20 animate-pulse rounded-lg bg-slate-200" />
      <div className="mt-5 h-64 animate-pulse rounded-lg bg-slate-200" />
    </section>
  );
}
