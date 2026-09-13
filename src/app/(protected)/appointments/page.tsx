import Link from "next/link";

import { AppointmentActions } from "@/components/appointment-actions";
import { requirePageCapability } from "@/modules/auth/page";
import { allowedTransitions } from "@/modules/appointments/lifecycle";
import { listDailyAgenda, listUpcomingAppointments } from "@/modules/appointments/repository";
import {
  clinicDayRange,
  clinicTimezone,
  clinicToday,
  formatClinicDateTime,
  nextCalendarDate,
} from "@/modules/appointments/timezone";
import { agendaQuerySchema } from "@/modules/appointments/validation";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function shiftDate(date: string, days: number): string {
  let result = date;
  const direction = days < 0 ? -1 : 1;
  for (let index = 0; index < Math.abs(days); index += 1) {
    if (direction > 0) result = nextCalendarDate(result);
    else {
      const instant = new Date(`${result}T00:00:00.000Z`);
      instant.setUTCDate(instant.getUTCDate() - 1);
      result = instant.toISOString().slice(0, 10);
    }
  }
  return result;
}

const statusLabels = {
  SCHEDULED: "Scheduled",
  ARRIVED: "Arrived",
  IN_CONSULTATION: "In consultation",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
} as const;

export default async function AppointmentsPage({ searchParams }: Props) {
  const user = await requirePageCapability("appointments.read");
  const raw = await searchParams;
  const parsed = agendaQuerySchema.safeParse({
    date: typeof raw.date === "string" ? raw.date : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
  });
  const date = parsed.success && parsed.data.date ? parsed.data.date : clinicToday();
  const status = parsed.success ? parsed.data.status : undefined;
  const agenda = await listDailyAgenda(date, status);
  const upcomingEnd = clinicDayRange(shiftDate(clinicToday(), 7)).start;
  const upcoming = await listUpcomingAppointments(new Date(), upcomingEnd);

  return (
    <section>
      <PageHeader
        title="Appointments"
        description={`Daily agenda · times shown in ${clinicTimezone()}.`}
        actions={
          <Link className="btn btn-primary" href="/appointments/new">
            New appointment
          </Link>
        }
      />

      <div className="surface agenda-toolbar flex flex-wrap items-center gap-2 p-3">
        <Link className="btn btn-secondary" href={`/appointments?date=${shiftDate(date, -1)}`}>
          ← Previous
        </Link>
        <Link className="btn btn-secondary" href={`/appointments?date=${clinicToday()}`}>
          Today
        </Link>
        <form className="flex items-center gap-2" method="get">
          <label className="sr-only" htmlFor="agenda-date">
            Agenda date
          </label>
          <input
            className="field-control agenda-date"
            defaultValue={date}
            id="agenda-date"
            lang="en-GB"
            name="date"
            type="date"
          />
          <label className="sr-only" htmlFor="agenda-status">
            Status
          </label>
          <select
            className="field-control agenda-status"
            defaultValue={status ?? ""}
            id="agenda-status"
            name="status"
          >
            <option value="">All statuses</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary" type="submit">
            Go
          </button>
        </form>
        <Link className="btn btn-secondary" href={`/appointments?date=${shiftDate(date, 1)}`}>
          Next →
        </Link>
      </div>

      <SectionHeader
        title={formatClinicDateTime(clinicDayRange(date).start, "EEEE, d MMMM yyyy")}
      />
      <div className="surface agenda-surface mt-3 overflow-hidden">
        {agenda.length === 0 ? (
          <EmptyState
            title="No appointments today"
            description="Nothing is scheduled for this date."
            action={
              <Link className="btn btn-primary" href="/appointments/new">
                New appointment
              </Link>
            }
          />
        ) : (
          <>
            <table className="agenda-table min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Administrative reason</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agenda.map((item) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">
                      {formatClinicDateTime(new Date(item.scheduledStart), "HH:mm")}–
                      {formatClinicDateTime(new Date(item.scheduledEnd), "HH:mm")}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        className="font-medium text-slate-950 hover:underline"
                        href={`/patients/${item.patientId}`}
                      >
                        {item.patientDisplayName}
                      </Link>
                      <div className="font-mono text-xs text-slate-500">{item.patientNumber}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} label={statusLabels[item.status]} />
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-600">
                      {item.administrativeReason ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <AppointmentActions
                        allowedTransitions={allowedTransitions(user.role, item.status)}
                        appointmentId={item.id}
                        compact
                        status={item.status}
                        version={item.version}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="agenda-cards">
              {agenda.map((item) => (
                <article className="agenda-card" key={item.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="agenda-time">
                      {formatClinicDateTime(new Date(item.scheduledStart), "HH:mm")}–
                      {formatClinicDateTime(new Date(item.scheduledEnd), "HH:mm")}
                    </div>
                    <StatusBadge status={item.status} label={statusLabels[item.status]} />
                  </div>
                  <Link className="agenda-patient" href={`/patients/${item.patientId}`}>
                    {item.patientDisplayName}
                  </Link>
                  <div className="font-mono text-xs text-slate-500">{item.patientNumber}</div>
                  <p className="mt-2 text-sm text-slate-600">
                    {item.administrativeReason ?? "No administrative reason"}
                  </p>
                  <div className="mt-4">
                    <AppointmentActions
                      allowedTransitions={allowedTransitions(user.role, item.status)}
                      appointmentId={item.id}
                      compact
                      status={item.status}
                      version={item.version}
                    />
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="section-title">Upcoming seven days</h2>
        <span className="text-sm text-slate-500">{upcoming.length} active</span>
      </div>
      <ul className="surface mt-3 divide-y overflow-hidden">
        {upcoming.length === 0 ? (
          <li className="p-6 text-sm text-slate-600">
            No active appointments in the next seven days.
          </li>
        ) : (
          upcoming.map((item) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              key={item.id}
            >
              <div>
                <Link className="font-medium hover:underline" href={`/appointments/${item.id}`}>
                  {item.patientDisplayName}
                </Link>
                <p className="text-sm text-slate-600">
                  {formatClinicDateTime(new Date(item.scheduledStart))}
                </p>
              </div>
              <span className="flex items-center gap-3">
                <StatusBadge status={item.status} label={statusLabels[item.status]} />
                <span className="font-mono text-xs text-slate-500">{item.patientNumber}</span>
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
