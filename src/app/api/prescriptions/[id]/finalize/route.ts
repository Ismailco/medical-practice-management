import { requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { prescriptionJson, prescriptionRouteError } from "@/modules/prescriptions/http";
import { finalizePrescription } from "@/modules/prescriptions/service";
import { prescriptionIdSchema } from "@/modules/prescriptions/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    const actor = await requireCapability("prescriptions.finalize", request.headers);
    const id = prescriptionIdSchema.parse((await context.params).id);
    return prescriptionJson({
      prescription: await finalizePrescription(id, await request.json().catch(() => null), actor),
    });
  } catch (error) {
    return prescriptionRouteError(error);
  }
}
