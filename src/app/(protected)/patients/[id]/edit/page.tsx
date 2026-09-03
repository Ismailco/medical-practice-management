import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PatientForm } from "@/components/patient-form";
import { requirePageCapability } from "@/modules/auth/page";
import { findAdministrativePatientById } from "@/modules/patients/repository";
import { patientIdSchema } from "@/modules/patients/validation";

type PageContext = { params: Promise<{ id: string }> };

export default async function EditPatientPage({ params }: PageContext) {
  await requirePageCapability("patients.update_administrative");
  const parsedId = patientIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const patient = await findAdministrativePatientById(parsedId.data);
  if (!patient) notFound();
  if (patient.archivedAt) redirect(`/patients/${patient.id}`);

  return (
    <section className="max-w-4xl">
      <Link
        className="text-sm font-medium text-teal-800 hover:underline"
        href={`/patients/${patient.id}`}
      >
        ← Back to patient
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
        Edit {patient.patientNumber}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Patient numbers are permanent and cannot be edited.
      </p>
      <div className="mt-7 rounded-lg border border-slate-200 bg-white p-6">
        <PatientForm initial={patient} />
      </div>
    </section>
  );
}
