import { notFound, redirect } from "next/navigation";

import { AppointmentForm } from "@/components/appointment-form";
import { requirePageCapability } from "@/modules/auth/page";
import { findAppointmentById } from "@/modules/appointments/repository";
import { toClinicFormValues } from "@/modules/appointments/timezone";
import { appointmentIdSchema } from "@/modules/appointments/validation";
import { PageHeader } from "@/components/ui/page-header";

type Props = { params: Promise<{ id: string }> };

export default async function EditAppointmentPage({ params }: Props) {
  await requirePageCapability("appointments.update");
  const id = appointmentIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const item = await findAppointmentById(id.data);
  if (!item) notFound();
  if (item.status !== "SCHEDULED") redirect(`/appointments/${item.id}`);
  const start = new Date(item.scheduledStart);
  const end = new Date(item.scheduledEnd);
  const local = toClinicFormValues(start);
  return (
    <section className="form-page">
      <PageHeader
        backHref={`/appointments/${item.id}`}
        backLabel="Back to appointment"
        title="Reschedule appointment"
        description={`${item.patientDisplayName} · administrative appointment details`}
      />
      <div className="surface form-surface p-6">
        <AppointmentForm
          initial={{
            id: item.id,
            patient: {
              id: item.patientId,
              patientNumber: item.patientNumber,
              displayName: item.patientDisplayName,
            },
            localDate: local.date,
            localStartTime: local.time,
            durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
            administrativeReason: item.administrativeReason,
            version: item.version,
          }}
        />
      </div>
    </section>
  );
}
