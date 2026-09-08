import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentSession } from "@/modules/auth/session";
import { hasCapability } from "@/modules/auth/capabilities";
import { appointmentDashboardSummary } from "@/modules/appointments/repository";
import { formatClinicDateTime } from "@/modules/appointments/timezone";
import { followUpDashboardSummary } from "@/modules/follow-ups/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const currentSession = await getCurrentSession();
  if (!currentSession) redirect("/login");
  const currentUser = currentSession.user;
  const canReadFollowUps = hasCapability(currentUser.role, "followups.read_sensitive");
  const [summary, followUps] = await Promise.all([
    appointmentDashboardSummary(),
    canReadFollowUps ? followUpDashboardSummary() : Promise.resolve(null),
  ]);

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
      <h2 className="mt-8 text-xl font-semibold text-slate-950">Today</h2>
      <dl className="mt-3 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <dt className="text-sm text-slate-500">Appointments</dt>
          <dd className="mt-1 text-2xl font-semibold">{summary.total}</dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <dt className="text-sm text-slate-500">Waiting</dt>
          <dd className="mt-1 text-2xl font-semibold">{summary.waiting}</dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <dt className="text-sm text-slate-500">Next appointment</dt>
          <dd className="mt-1 text-sm font-medium">
            {summary.next
              ? formatClinicDateTime(new Date(summary.next.scheduledStart), "HH:mm")
              : "None"}
          </dd>
        </div>
      </dl>
      <Link
        className="mt-5 inline-flex text-sm font-semibold text-teal-800 hover:underline"
        href="/appointments"
      >
        Open daily agenda →
      </Link>
      {followUps ? (
        <section className="mt-10 border-t border-slate-200 pt-8">
          <h2 className="text-xl font-semibold text-slate-950">Follow-ups</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="text-sm text-red-800">Overdue</div>
              <div className="mt-1 text-2xl font-semibold text-red-950">{followUps.overdue}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-sm text-slate-500">Due today</div>
              <div className="mt-1 text-2xl font-semibold">{followUps.dueToday}</div>
            </div>
          </div>
          <Link
            className="mt-4 inline-flex text-sm font-semibold text-teal-800 hover:underline"
            href="/follow-ups"
          >
            Open follow-ups →
          </Link>
        </section>
      ) : null}
    </section>
  );
}
