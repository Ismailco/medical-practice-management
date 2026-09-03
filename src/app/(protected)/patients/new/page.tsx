import Link from "next/link";

import { PatientForm } from "@/components/patient-form";
import { requirePageCapability } from "@/modules/auth/page";

export default async function NewPatientPage() {
  await requirePageCapability("patients.create");

  return (
    <section className="max-w-4xl">
      <Link className="text-sm font-medium text-teal-800 hover:underline" href="/patients">
        ← Back to patients
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">New patient</h1>
      <p className="mt-2 text-sm text-slate-600">
        Create an administrative record. Optional fields can be completed later.
      </p>
      <div className="mt-7 rounded-lg border border-slate-200 bg-white p-6">
        <PatientForm />
      </div>
    </section>
  );
}
