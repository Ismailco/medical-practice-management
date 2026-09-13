import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentSession } from "@/modules/auth/session";
import { hasCapability } from "@/modules/auth/capabilities";
import { appointmentDashboardSummary } from "@/modules/appointments/repository";
import { formatClinicDateTime } from "@/modules/appointments/timezone";
import { followUpDashboardSummary } from "@/modules/follow-ups/repository";
import { roleLabels } from "@/lib/presentation";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

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
    <section>
      <PageHeader
        title={`Welcome, ${currentUser.name}`}
        description={`${roleLabels[currentUser.role]} workspace · ${formatClinicDateTime(new Date(), "EEEE, d MMMM yyyy")}`}
      />
      <section className="surface p-5">
        <SectionHeader
          title="What needs attention today?"
          actions={
            <Link className="btn btn-secondary" href="/appointments">
              Open agenda
            </Link>
          }
        />
        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="summary-tile">
            <dt>Today&apos;s appointments</dt>
            <dd>{summary.total}</dd>
          </div>
          <div className="summary-tile">
            <dt>Waiting / arrived</dt>
            <dd>{summary.waiting}</dd>
          </div>
          <div className="summary-tile">
            <dt>Next appointment</dt>
            <dd>
              {summary.next
                ? formatClinicDateTime(new Date(summary.next.scheduledStart), "HH:mm")
                : "None"}
            </dd>
          </div>
        </dl>
      </section>
      {followUps ? (
        <section className="surface mt-5 p-5">
          <SectionHeader
            title="Follow-ups"
            actions={
              <Link className="btn btn-secondary" href="/follow-ups">
                Open follow-ups
              </Link>
            }
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="summary-tile summary-tile-danger">
              <dt>
                <StatusBadge status="OVERDUE" />
              </dt>
              <dd>{followUps.overdue}</dd>
            </div>
            <div className="summary-tile">
              <dt>Due today</dt>
              <dd>{followUps.dueToday}</dd>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
