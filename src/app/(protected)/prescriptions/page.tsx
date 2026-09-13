import Link from "next/link";

import { requirePageCapability } from "@/modules/auth/page";
import { listPrescriptions } from "@/modules/prescriptions/repository";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateOnly } from "@/lib/presentation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PrescriptionsPage() {
  await requirePageCapability("prescriptions.read");
  const prescriptions = await listPrescriptions();
  return (
    <section>
      <PageHeader
        title="Prescriptions"
        description="Physician-entered prescription history. No recommendations are generated."
      />
      <ul className="surface mt-4 divide-y overflow-hidden">
        {prescriptions.length === 0 ? (
          <li>
            <EmptyState
              title="No prescriptions yet"
              description="Issued prescriptions and active drafts will appear here."
            />
          </li>
        ) : (
          prescriptions.map((item) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
              key={item.id}
            >
              <div>
                <Link
                  className="font-medium text-teal-800 hover:underline"
                  href={`/prescriptions/${item.id}`}
                >
                  {item.prescriptionNumber ?? "Draft prescription"}
                </Link>
                <p className="mt-1 text-sm text-slate-600">
                  {item.patientDisplayName} · {item.patientNumber}
                </p>
              </div>
              <div className="text-right text-sm text-slate-600">
                <StatusBadge status={item.status} />
                <div className="mt-2">
                  {item.issueDate ? formatDateOnly(item.issueDate) : "Not issued"}
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
