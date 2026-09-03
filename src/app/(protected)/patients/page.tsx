import Link from "next/link";

import { PatientList } from "@/components/patient-list";
import { requirePageCapability } from "@/modules/auth/page";
import { searchAdministrativePatients } from "@/modules/patients/repository";

export default async function PatientsPage() {
  await requirePageCapability("patients.read_administrative");
  const result = await searchAdministrativePatients({ q: "", page: 1, includeArchived: false });

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wider text-teal-800 uppercase">
            Administration
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Patients</h1>
          <p className="mt-2 text-sm text-slate-600">
            Administrative records only. No clinical information is stored here.
          </p>
        </div>
        <Link
          className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900"
          href="/patients/new"
        >
          New patient
        </Link>
      </div>
      <PatientList initial={result} />
    </section>
  );
}
