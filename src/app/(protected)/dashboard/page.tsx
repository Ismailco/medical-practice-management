import { redirect } from "next/navigation";

import { getCurrentSession } from "@/modules/auth/session";

export default async function DashboardPage() {
  const currentSession = await getCurrentSession();
  if (!currentSession) redirect("/login");
  const currentUser = currentSession.user;

  return (
    <section className="max-w-3xl">
      <p className="text-sm font-semibold tracking-wider text-teal-800 uppercase">
        Authenticated shell
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
        Welcome, {currentUser.name}
      </h1>
      <dl className="mt-8 grid gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-slate-500">Login identifier</dt>
          <dd className="mt-1 font-medium text-slate-900">{currentUser.email}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">Role</dt>
          <dd className="mt-1 font-medium text-slate-900">{currentUser.role}</dd>
        </div>
      </dl>
      <p className="mt-6 text-sm leading-6 text-slate-600">
        Authentication and authorization are active. Clinical and administrative workflows are not
        implemented yet.
      </p>
    </section>
  );
}
