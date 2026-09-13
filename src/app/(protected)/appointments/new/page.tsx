import { AppointmentForm } from "@/components/appointment-form";
import { requirePageCapability } from "@/modules/auth/page";
import { clinicToday } from "@/modules/appointments/timezone";
import { findAdministrativePatientById } from "@/modules/patients/repository";
import { patientIdSchema } from "@/modules/patients/validation";
import { PageHeader } from "@/components/ui/page-header";

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
    <section className="form-page">
      <PageHeader
        backHref="/appointments"
        backLabel="Back to appointments"
        title="New appointment"
        description="Schedule administrative appointment information only."
      />
      <div className="surface form-surface p-6">
        <AppointmentForm
          defaultDate={clinicToday()}
          {...(initialPatient ? { initialPatient } : {})}
        />
      </div>
    </section>
  );
}
