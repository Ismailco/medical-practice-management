import { noStoreJson, requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { patientRouteError } from "@/modules/patients/http";
import { findAdministrativePatientById } from "@/modules/patients/repository";
import { updatePatientAdministrativeData } from "@/modules/patients/service";
import { patientIdSchema } from "@/modules/patients/validation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireCapability("patients.read_administrative", request.headers);
    const patientId = patientIdSchema.parse((await context.params).id);
    const patient = await findAdministrativePatientById(patientId);
    if (!patient) return noStoreJson({ error: "Not found." }, { status: 404 });
    return noStoreJson({ patient });
  } catch (error) {
    return patientRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    const actor = await requireCapability("patients.update_administrative", request.headers);
    const patientId = patientIdSchema.parse((await context.params).id);
    const patient = await updatePatientAdministrativeData(
      patientId,
      await request.json().catch(() => null),
      actor.id,
    );
    return noStoreJson({ patient });
  } catch (error) {
    return patientRouteError(error);
  }
}
