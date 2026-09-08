import { requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { prescriptionJson, prescriptionRouteError } from "@/modules/prescriptions/http";
import { discardPrescriptionDraft } from "@/modules/prescriptions/service";
import { prescriptionIdSchema } from "@/modules/prescriptions/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    const actor = await requireCapability("prescriptions.update_draft", request.headers);
    const id = prescriptionIdSchema.parse((await context.params).id);
    await discardPrescriptionDraft(id, await request.json().catch(() => null), actor);
    return prescriptionJson({ ok: true });
  } catch (error) {
    return prescriptionRouteError(error);
  }
}
