import { noStoreJson, requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability, requireSession } from "@/modules/auth/session";
import { appointmentRouteError } from "@/modules/appointments/http";
import { transitionCapability } from "@/modules/appointments/lifecycle";
import { transitionAppointmentStatus } from "@/modules/appointments/service";
import {
  appointmentIdSchema,
  appointmentTransitionInputSchema,
} from "@/modules/appointments/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    await requireSession(request.headers);
    const input = appointmentTransitionInputSchema.parse(await request.json().catch(() => null));
    const actor = await requireCapability(
      transitionCapability(input.targetStatus),
      request.headers,
    );
    const id = appointmentIdSchema.parse((await context.params).id);
    const updated = await transitionAppointmentStatus(id, input, actor);
    return noStoreJson({ appointment: updated });
  } catch (error) {
    return appointmentRouteError(error);
  }
}
