import Link from "next/link";

import { requirePageCapability } from "@/modules/auth/page";
import { formatClinicDateTime } from "@/modules/appointments/timezone";
import { listConsultations } from "@/modules/consultations/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ConsultationsPage() {
  await requirePageCapability("consultations.read");
  const consultations = await listConsultations();
  return (
    <section>
      <div>
        <p className="text-sm font-semibold tracking-wider text-teal-800 uppercase">
          Clinical records
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Consultations</h1>
        <p className="mt-2 text-sm text-slate-600">
          Doctor-only consultation history. Clinical text appears only inside a consultation.
        </p>
      </div>
      <div className="mt-7 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {consultations.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-600">No consultations recorded.</p>
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
                    {item.status === "IN_PROGRESS" ? "In progress" : "Finalized"}
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
