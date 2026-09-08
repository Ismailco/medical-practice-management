import { requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { prescriptionJson, prescriptionRouteError } from "@/modules/prescriptions/http";
import { getPracticeProfile } from "@/modules/prescriptions/repository";
import { savePracticeProfile } from "@/modules/prescriptions/service";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requireCapability("practice_profile.manage", request.headers);
    return prescriptionJson(await getPracticeProfile(actor.id));
  } catch (error) {
    return prescriptionRouteError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    const actor = await requireCapability("practice_profile.manage", request.headers);
    return prescriptionJson(
      await savePracticeProfile(await request.json().catch(() => null), actor),
    );
  } catch (error) {
    return prescriptionRouteError(error);
  }
}
