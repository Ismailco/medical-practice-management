import { noStoreJson, requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { appointmentRouteError } from "@/modules/appointments/http";
import { findAppointmentById } from "@/modules/appointments/repository";
import { rescheduleAppointment } from "@/modules/appointments/service";
import { appointmentIdSchema } from "@/modules/appointments/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    await requireCapability("appointments.read", request.headers);
    const id = appointmentIdSchema.parse((await context.params).id);
    const record = await findAppointmentById(id);
    return record
      ? noStoreJson({ appointment: record })
      : noStoreJson({ error: "Not found." }, { status: 404 });
  } catch (error) {
    return appointmentRouteError(error);
  }
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    const actor = await requireCapability("appointments.update", request.headers);
    const id = appointmentIdSchema.parse((await context.params).id);
    const updated = await rescheduleAppointment(id, await request.json().catch(() => null), actor);
    return noStoreJson({ appointment: updated });
  } catch (error) {
    return appointmentRouteError(error);
  }
}
