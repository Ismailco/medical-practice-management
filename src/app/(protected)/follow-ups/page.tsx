import Link from "next/link";

import { requirePageCapability } from "@/modules/auth/page";
import type { FollowUpSummaryDto } from "@/modules/follow-ups/dto";
import { listOperationalFollowUps } from "@/modules/follow-ups/repository";

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
      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {items.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">{empty}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li className="grid gap-2 px-4 py-4 sm:grid-cols-[8rem_1fr_auto]" key={item.id}>
                <div className="font-medium text-slate-800">{item.dueDate}</div>
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
    <div className="max-w-5xl">
      <p className="text-sm font-semibold tracking-wider text-teal-800 uppercase">
        Clinical workflow
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Follow-ups</h1>
      <p className="mt-2 text-sm text-slate-600">
        Doctor-only work due in the clinic calendar. Today is {groups.today}.
      </p>
      <FollowUpSection empty="No overdue follow-ups." items={groups.overdue} title="Overdue" />
      <FollowUpSection empty="No follow-ups due today." items={groups.dueToday} title="Due today" />
      <FollowUpSection empty="No upcoming follow-ups." items={groups.upcoming} title="Upcoming" />
    </div>
  );
}
