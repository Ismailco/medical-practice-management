import { noStoreJson, requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { appointmentRouteError } from "@/modules/appointments/http";
import { listDailyAgenda } from "@/modules/appointments/repository";
import { createAppointment } from "@/modules/appointments/service";
import { clinicToday } from "@/modules/appointments/timezone";
import { agendaQuerySchema } from "@/modules/appointments/validation";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireCapability("appointments.read", request.headers);
    const url = new URL(request.url);
    const input = agendaQuerySchema.parse(Object.fromEntries(url.searchParams));
    const date = input.date ?? clinicToday();
    return noStoreJson({ date, appointments: await listDailyAgenda(date, input.status) });
  } catch (error) {
    return appointmentRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    const actor = await requireCapability("appointments.create", request.headers);
    const created = await createAppointment(await request.json().catch(() => null), actor);
    return noStoreJson({ appointment: created }, { status: 201 });
  } catch (error) {
    return appointmentRouteError(error);
  }
}
