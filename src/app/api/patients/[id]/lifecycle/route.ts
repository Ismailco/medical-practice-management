import { noStoreJson, requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability, requireSession } from "@/modules/auth/session";
import { patientRouteError } from "@/modules/patients/http";
import { changePatientArchiveState } from "@/modules/patients/service";
import { patientIdSchema, patientLifecycleInputSchema } from "@/modules/patients/validation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    await requireSession(request.headers);
    const input = patientLifecycleInputSchema.parse(await request.json().catch(() => null));
    const capability = input.action === "archive" ? "patients.archive" : "patients.restore";
    const actor = await requireCapability(capability, request.headers);
    const patientId = patientIdSchema.parse((await context.params).id);
    const patient = await changePatientArchiveState(patientId, input, actor.id);
    return noStoreJson({ patient });
  } catch (error) {
    return patientRouteError(error);
  }
}
