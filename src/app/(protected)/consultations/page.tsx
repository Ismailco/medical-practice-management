import Link from "next/link";

import { requirePageCapability } from "@/modules/auth/page";
import { formatClinicDateTime } from "@/modules/appointments/timezone";
import { listConsultations } from "@/modules/consultations/repository";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ConsultationsPage() {
  await requirePageCapability("consultations.read");
  const consultations = await listConsultations();
  return (
    <section>
      <PageHeader
        title="Consultations"
        description="Doctor-only consultation history. Clinical text appears only inside a consultation."
      />
      <div className="surface mt-4 overflow-hidden">
        {consultations.length === 0 ? (
          <EmptyState
            title="No consultations recorded"
            description="Consultations will appear here after a visit is started."
          />
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase">
              <tr>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {consultations.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium text-teal-800 hover:underline"
                      href={`/consultations/${item.id}`}
                    >
                      {formatClinicDateTime(new Date(item.startedAt))}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{item.patientDisplayName}</span>
                    <div className="font-mono text-xs text-slate-500">{item.patientNumber}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
