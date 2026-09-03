import { noStoreJson, requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { patientRouteError } from "@/modules/patients/http";
import { searchAdministrativePatients } from "@/modules/patients/repository";
import { patientSearchInputSchema } from "@/modules/patients/validation";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    await requireCapability("patients.read_administrative", request.headers);
    const input = patientSearchInputSchema.parse(await request.json().catch(() => null));
    return noStoreJson(await searchAdministrativePatients(input));
  } catch (error) {
    return patientRouteError(error);
  }
}
