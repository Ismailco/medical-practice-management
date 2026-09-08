import Link from "next/link";

import { requirePageCapability } from "@/modules/auth/page";
import { listPrescriptions } from "@/modules/prescriptions/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PrescriptionsPage() {
  await requirePageCapability("prescriptions.read");
  const prescriptions = await listPrescriptions();
  return (
    <section>
      <p className="text-sm font-semibold tracking-wider text-teal-800 uppercase">
        Clinical workflow
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Prescriptions</h1>
      <p className="mt-2 text-sm text-slate-600">
        Physician-entered prescription history. No recommendations are generated.
      </p>
      <ul className="mt-7 divide-y rounded-lg border border-slate-200 bg-white">
        {prescriptions.length === 0 ? (
          <li className="p-6 text-sm text-slate-600">No prescriptions yet.</li>
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
                <div>{item.status}</div>
                <div>{item.issueDate ?? "Not issued"}</div>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
