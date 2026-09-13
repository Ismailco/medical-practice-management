import Link from "next/link";
import { notFound } from "next/navigation";

import { AppointmentActions } from "@/components/appointment-actions";
import { requirePageCapability } from "@/modules/auth/page";
import { allowedTransitions } from "@/modules/appointments/lifecycle";
import { findAppointmentById } from "@/modules/appointments/repository";
import { clinicTimezone, formatClinicDateTime } from "@/modules/appointments/timezone";
import { appointmentIdSchema } from "@/modules/appointments/validation";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

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
    <section className="detail-page">
      <PageHeader
        backHref="/appointments"
        backLabel="Back to appointments"
        title={item.patientDisplayName}
        description={`${item.patientNumber} · Appointment details`}
        status={<StatusBadge status={item.status} label={labels[item.status]} />}
        actions={
          <AppointmentActions
            allowedTransitions={allowedTransitions(user.role, item.status)}
            appointmentId={item.id}
            status={item.status}
            version={item.version}
          />
        }
      />
      <dl className="surface mt-7 grid gap-6 p-6 sm:grid-cols-2">
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
