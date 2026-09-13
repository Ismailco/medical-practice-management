import Link from "next/link";

import { requirePageCapability } from "@/modules/auth/page";
import type { FollowUpSummaryDto } from "@/modules/follow-ups/dto";
import { listOperationalFollowUps } from "@/modules/follow-ups/repository";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateOnly } from "@/lib/presentation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function FollowUpSection({
  title,
  items,
  empty,
}: Readonly<{ title: string; items: readonly FollowUpSummaryDto[]; empty: string }>) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <div className="surface mt-3 overflow-hidden">
        {items.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">{empty}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li
                className="grid gap-2 px-4 py-4 sm:grid-cols-[8rem_minmax(0,1fr)_auto_auto]"
                key={item.id}
              >
                <div className="font-medium text-slate-800">{formatDateOnly(item.dueDate)}</div>
                <div>
                  <Link
                    className="font-semibold text-teal-800 hover:underline"
                    href={`/follow-ups/${item.id}`}
                  >
                    {item.patientDisplayName}
                  </Link>
                  <div className="font-mono text-xs text-slate-500">{item.patientNumber}</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.reason}</p>
                </div>
                <Link
                  className="text-sm font-medium text-teal-800 hover:underline"
                  href={`/patients/${item.patientId}`}
                >
                  Patient
                </Link>
                <StatusBadge status={item.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default async function FollowUpsPage() {
  await requirePageCapability("followups.read_sensitive");
  const groups = await listOperationalFollowUps();
  return (
    <div>
      <PageHeader
        title="Follow-ups"
        description={`Doctor-only work due in the clinic calendar. Today is ${formatDateOnly(groups.today)}.`}
      />
      <FollowUpSection empty="No overdue follow-ups." items={groups.overdue} title="Overdue" />
      <FollowUpSection empty="No follow-ups due today." items={groups.dueToday} title="Due today" />
      <FollowUpSection empty="No upcoming follow-ups." items={groups.upcoming} title="Upcoming" />
    </div>
  );
}
