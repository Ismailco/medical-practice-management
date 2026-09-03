import Link from "next/link";
import { notFound } from "next/navigation";

import { AppointmentActions } from "@/components/appointment-actions";
import { requirePageCapability } from "@/modules/auth/page";
import { allowedTransitions } from "@/modules/appointments/lifecycle";
import { findAppointmentById } from "@/modules/appointments/repository";
import { clinicTimezone, formatClinicDateTime } from "@/modules/appointments/timezone";
import { appointmentIdSchema } from "@/modules/appointments/validation";

type Props = { params: Promise<{ id: string }> };
const labels = {
  SCHEDULED: "Scheduled",
  ARRIVED: "Arrived",
  IN_CONSULTATION: "In consultation",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
} as const;

export default async function AppointmentPage({ params }: Props) {
  const user = await requirePageCapability("appointments.read");
  const id = appointmentIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const item = await findAppointmentById(id.data);
  if (!item) notFound();
  return (
    <section className="max-w-4xl">
      <Link className="text-sm font-medium text-teal-800 hover:underline" href="/appointments">
        ← Back to appointments
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-slate-500">{item.patientNumber}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{item.patientDisplayName}</h1>
          <p className="mt-2 text-sm text-slate-600">Appointment details</p>
        </div>
        <AppointmentActions
          allowedTransitions={allowedTransitions(user.role, item.status)}
          appointmentId={item.id}
          status={item.status}
          version={item.version}
        />
      </div>
      <dl className="mt-7 grid gap-6 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-slate-500">Patient</dt>
          <dd className="mt-1">
            <Link
              className="font-medium text-teal-800 hover:underline"
              href={`/patients/${item.patientId}`}
            >
              {item.patientDisplayName}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Status</dt>
          <dd className="mt-1 font-medium">{labels[item.status]}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Scheduled</dt>
          <dd className="mt-1">
            {formatClinicDateTime(new Date(item.scheduledStart))}–
            {formatClinicDateTime(new Date(item.scheduledEnd), "HH:mm")}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Timezone</dt>
          <dd className="mt-1">{clinicTimezone()}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm font-medium text-slate-500">Administrative reason</dt>
          <dd className="mt-1">{item.administrativeReason ?? "—"}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs text-slate-500">Version {item.version}</p>
    </section>
  );
}
