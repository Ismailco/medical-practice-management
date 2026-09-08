import { requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { prescriptionJson, prescriptionRouteError } from "@/modules/prescriptions/http";
import { listPrescriptions } from "@/modules/prescriptions/repository";
import { createPrescriptionDraft } from "@/modules/prescriptions/service";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireCapability("prescriptions.read", request.headers);
    return prescriptionJson({ prescriptions: await listPrescriptions() });
  } catch (error) {
    return prescriptionRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    const actor = await requireCapability("prescriptions.create", request.headers);
    const created = await createPrescriptionDraft(await request.json().catch(() => null), actor);
    return prescriptionJson({ prescription: created }, { status: 201 });
  } catch (error) {
    return prescriptionRouteError(error);
  }
}
