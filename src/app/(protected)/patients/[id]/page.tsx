import Link from "next/link";
import { notFound } from "next/navigation";

import { PatientLifecycleButton } from "@/components/patient-lifecycle-button";
import { StartDirectConsultationButton } from "@/components/start-direct-consultation-button";
import { FollowUpCreateForm } from "@/components/follow-up-create-form";
import { PrescriptionCreateButton } from "@/components/prescription-create-button";
import { hasCapability } from "@/modules/auth/capabilities";
import { requirePageCapability } from "@/modules/auth/page";
import { listPatientAppointments } from "@/modules/appointments/repository";
import { formatClinicDateTime } from "@/modules/appointments/timezone";
import { appointmentHistoryQuerySchema } from "@/modules/appointments/validation";
import { listPatientConsultations } from "@/modules/consultations/repository";
import { listPatientFollowUps } from "@/modules/follow-ups/repository";
import { listPatientPrescriptions } from "@/modules/prescriptions/repository";
import { findAdministrativePatientById } from "@/modules/patients/repository";
import { patientIdSchema } from "@/modules/patients/validation";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateOnly, humanizeStatus } from "@/lib/presentation";

type PageContext = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
};

function Value({ children }: { children: string | null }) {
  return <dd className="mt-1 whitespace-pre-line text-slate-950">{children ?? "—"}</dd>;
}

export default async function PatientPage({ params, searchParams }: PageContext) {
  const currentUser = await requirePageCapability("patients.read_administrative");
  const parsedId = patientIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const patient = await findAdministrativePatientById(parsedId.data);
  if (!patient) notFound();
  const archived = patient.archivedAt !== null;
  const historyQuery = appointmentHistoryQuerySchema.safeParse(await searchParams);
  const historyPage = historyQuery.success ? historyQuery.data.page : 1;
  const appointmentHistory = await listPatientAppointments(patient.id, historyPage);
  const canReadConsultations = hasCapability(currentUser.role, "consultations.read");
  const consultations = canReadConsultations ? await listPatientConsultations(patient.id) : [];
  const canReadFollowUps = hasCapability(currentUser.role, "followups.read_sensitive");
  const followUps = canReadFollowUps ? await listPatientFollowUps(patient.id) : [];
  const canReadPrescriptions = hasCapability(currentUser.role, "prescriptions.read");
  const prescriptions = canReadPrescriptions ? await listPatientPrescriptions(patient.id) : [];

  return (
    <section className="detail-page">
      <PageHeader
        backHref="/patients"
        backLabel="Back to patients"
        title={`${patient.firstName} ${patient.lastName}`}
        description={`${patient.patientNumber} · DOB ${formatDateOnly(patient.dateOfBirth)}`}
        status={<StatusBadge status={archived ? "ARCHIVED" : "ACTIVE"} />}
        actions={
          <>
            {!archived ? (
              <Link className="btn btn-primary" href={`/appointments/new?patient=${patient.id}`}>
                Schedule appointment
              </Link>
            ) : null}
            {!archived ? (
              <Link className="btn btn-secondary" href={`/patients/${patient.id}/edit`}>
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
          </>
        }
      />

      {archived ? (
        <p className="mt-6 rounded-md border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">
          This record is archived and cannot be edited until a doctor restores it. Historical
          records remain available.
        </p>
      ) : null}

      <dl className="surface mt-7 grid gap-x-8 gap-y-6 p-6 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-slate-500">Date of birth</dt>
          <Value>{formatDateOnly(patient.dateOfBirth)}</Value>
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
        Created {formatClinicDateTime(patient.createdAt)} · Updated{" "}
        {formatClinicDateTime(patient.updatedAt)} · Version {patient.version}
      </p>

      <SectionHeader
        title="Appointments"
        actions={<span className="text-sm text-slate-500">{appointmentHistory.total} total</span>}
      />
      <ul className="surface mt-3 divide-y overflow-hidden">
        {appointmentHistory.items.length === 0 ? (
          <li className="p-6 text-sm text-slate-600">No appointment history.</li>
        ) : (
          appointmentHistory.items.map((item) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              key={item.id}
            >
              <div>
                <Link
                  className="font-medium text-teal-800 hover:underline"
                  href={`/appointments/${item.id}`}
                >
                  {formatClinicDateTime(new Date(item.scheduledStart))}
                </Link>
                {item.administrativeReason ? (
                  <p className="mt-1 text-sm text-slate-600">{item.administrativeReason}</p>
                ) : null}
              </div>
              <span className="text-sm font-medium text-slate-700">
                <StatusBadge status={item.status} />
              </span>
            </li>
          ))
        )}
      </ul>
      {appointmentHistory.totalPages > 1 ? (
        <nav
          aria-label="Appointment history pages"
          className="mt-4 flex items-center justify-between"
        >
          <Link
            aria-disabled={appointmentHistory.page <= 1}
            className="text-sm font-medium text-teal-800 aria-disabled:pointer-events-none aria-disabled:text-slate-400"
            href={`/patients/${patient.id}?page=${Math.max(1, appointmentHistory.page - 1)}`}
          >
            ← Previous
          </Link>
          <span className="text-sm text-slate-600">
            Page {appointmentHistory.page} of {appointmentHistory.totalPages}
          </span>
          <Link
            aria-disabled={appointmentHistory.page >= appointmentHistory.totalPages}
            className="text-sm font-medium text-teal-800 aria-disabled:pointer-events-none aria-disabled:text-slate-400"
            href={`/patients/${patient.id}?page=${Math.min(appointmentHistory.totalPages, appointmentHistory.page + 1)}`}
          >
            Next →
          </Link>
        </nav>
      ) : null}

      {canReadConsultations ? (
        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="section-title">Consultations</h2>
            {!archived ? <StartDirectConsultationButton patientId={patient.id} /> : null}
          </div>
          <ul className="surface mt-3 divide-y overflow-hidden">
            {consultations.length === 0 ? (
              <li className="p-6 text-sm text-slate-600">No consultation history.</li>
            ) : (
              consultations.map((consultation) => (
                <li
                  className="flex items-center justify-between gap-3 px-4 py-3"
                  key={consultation.id}
                >
                  <Link
                    className="font-medium text-teal-800 hover:underline"
                    href={`/consultations/${consultation.id}`}
                  >
                    {formatClinicDateTime(new Date(consultation.startedAt))}
                  </Link>
                  <span className="text-sm text-slate-700">
                    <StatusBadge status={consultation.status} />
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      ) : null}
      {canReadFollowUps ? (
        <section className="mt-10">
          <h2 className="section-title">Follow-ups</h2>
          <ul className="surface mt-3 divide-y overflow-hidden">
            {followUps.length === 0 ? (
              <li className="p-6 text-sm text-slate-600">No follow-up history.</li>
            ) : (
              followUps.map((item) => (
                <li
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                  key={item.id}
                >
                  <div>
                    <Link
                      className="font-medium text-teal-800 hover:underline"
                      href={`/follow-ups/${item.id}`}
                    >
                      Due {formatDateOnly(item.dueDate)}
                    </Link>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.reason}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </li>
              ))
            )}
          </ul>
          {!archived ? <FollowUpCreateForm patientId={patient.id} /> : null}
        </section>
      ) : null}
      {canReadPrescriptions ? (
        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="section-title">Prescriptions</h2>
            {!archived ? <PrescriptionCreateButton patientId={patient.id} /> : null}
          </div>
          <ul className="surface mt-3 divide-y overflow-hidden">
            {prescriptions.length === 0 ? (
              <li className="p-6 text-sm text-slate-600">No prescription history.</li>
            ) : (
              prescriptions.map((item) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  key={item.id}
                >
                  <Link
                    className="font-medium text-teal-800 hover:underline"
                    href={`/prescriptions/${item.id}`}
                  >
                    {item.prescriptionNumber ?? "Draft prescription"}
                  </Link>
                  <span className="text-sm text-slate-600">
                    {humanizeStatus(item.status)}
                    {item.issueDate ? ` · ${formatDateOnly(item.issueDate)}` : ""}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
