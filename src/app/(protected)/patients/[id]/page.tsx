import Link from "next/link";
import { notFound } from "next/navigation";

import { PatientLifecycleButton } from "@/components/patient-lifecycle-button";
import { hasCapability } from "@/modules/auth/capabilities";
import { requirePageCapability } from "@/modules/auth/page";
import { findAdministrativePatientById } from "@/modules/patients/repository";
import { patientIdSchema } from "@/modules/patients/validation";

type PageContext = { params: Promise<{ id: string }> };

function Value({ children }: { children: string | null }) {
  return <dd className="mt-1 whitespace-pre-line text-slate-950">{children ?? "—"}</dd>;
}

export default async function PatientPage({ params }: PageContext) {
  const currentUser = await requirePageCapability("patients.read_administrative");
  const parsedId = patientIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const patient = await findAdministrativePatientById(parsedId.data);
  if (!patient) notFound();
  const archived = patient.archivedAt !== null;

  return (
    <section className="max-w-5xl">
      <Link className="text-sm font-medium text-teal-800 hover:underline" href="/patients">
        ← Back to patients
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              {patient.firstName} {patient.lastName}
            </h1>
            {archived ? (
              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                Archived
              </span>
            ) : null}
          </div>
          <p className="mt-2 font-mono text-sm text-slate-600">{patient.patientNumber}</p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          {!archived ? (
            <Link
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-white"
              href={`/patients/${patient.id}/edit`}
            >
              Edit details
            </Link>
          ) : null}
          {hasCapability(currentUser.role, archived ? "patients.restore" : "patients.archive") ? (
            <PatientLifecycleButton
              archived={archived}
              patientId={patient.id}
              patientNumber={patient.patientNumber}
              version={patient.version}
            />
          ) : null}
        </div>
      </div>

      {archived ? (
        <p className="mt-6 rounded-md border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">
          This record is archived and cannot be edited until a doctor restores it.
        </p>
      ) : null}

      <dl className="mt-7 grid gap-x-8 gap-y-6 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-slate-500">Date of birth</dt>
          <Value>{patient.dateOfBirth}</Value>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Phone</dt>
          <Value>{patient.phone}</Value>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Email</dt>
          <Value>{patient.email}</Value>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Address</dt>
          <Value>{patient.address}</Value>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Emergency contact</dt>
          <Value>{patient.emergencyContactName}</Value>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Emergency contact phone</dt>
          <Value>{patient.emergencyContactPhone}</Value>
        </div>
      </dl>

      <p className="mt-4 text-xs text-slate-500">
        Created {patient.createdAt.toISOString()} · Updated {patient.updatedAt.toISOString()} ·
        Version {patient.version}
      </p>
    </section>
  );
}
