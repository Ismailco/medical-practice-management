import Link from "next/link";

import { AppointmentForm } from "@/components/appointment-form";
import { requirePageCapability } from "@/modules/auth/page";
import { clinicToday } from "@/modules/appointments/timezone";
import { findAdministrativePatientById } from "@/modules/patients/repository";
import { patientIdSchema } from "@/modules/patients/validation";

type Props = { searchParams: Promise<{ patient?: string }> };

export default async function NewAppointmentPage({ searchParams }: Props) {
  await requirePageCapability("appointments.create");
  const candidate = (await searchParams).patient;
  const parsed = patientIdSchema.safeParse(candidate);
  const record = parsed.success ? await findAdministrativePatientById(parsed.data) : null;
  const initialPatient =
    record && !record.archivedAt
      ? {
          id: record.id,
          patientNumber: record.patientNumber,
          displayName: `${record.firstName} ${record.lastName}`,
        }
      : undefined;
  return (
    <section className="max-w-3xl">
      <Link className="text-sm font-medium text-teal-800 hover:underline" href="/appointments">
        ← Back to appointments
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">New appointment</h1>
      <p className="mt-2 text-sm text-slate-600">
        Schedule administrative appointment information only.
      </p>
      <div className="mt-7 rounded-lg border border-slate-200 bg-white p-6">
        <AppointmentForm
          defaultDate={clinicToday()}
          {...(initialPatient ? { initialPatient } : {})}
        />
      </div>
    </section>
  );
}
