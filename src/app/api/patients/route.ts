import { noStoreJson, requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { patientRouteError } from "@/modules/patients/http";
import { searchAdministrativePatients } from "@/modules/patients/repository";
import { createPatient } from "@/modules/patients/service";
import { patientListQuerySchema } from "@/modules/patients/validation";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireCapability("patients.read_administrative", request.headers);
    const url = new URL(request.url);
    const input = patientListQuerySchema.parse(Object.fromEntries(url.searchParams));
    return noStoreJson(await searchAdministrativePatients({ ...input, q: "" }));
  } catch (error) {
    return patientRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    const actor = await requireCapability("patients.create", request.headers);
    const patient = await createPatient(await request.json().catch(() => null), actor.id);
    return noStoreJson({ patient }, { status: 201 });
  } catch (error) {
    return patientRouteError(error);
  }
}
