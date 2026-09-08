import { requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { prescriptionJson, prescriptionRouteError } from "@/modules/prescriptions/http";
import { createReplacementPrescription } from "@/modules/prescriptions/service";
import { prescriptionIdSchema } from "@/modules/prescriptions/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    const actor = await requireCapability("prescriptions.replace", request.headers);
    const id = prescriptionIdSchema.parse((await context.params).id);
    return prescriptionJson(
      { prescription: await createReplacementPrescription(id, actor) },
      { status: 201 },
    );
  } catch (error) {
    return prescriptionRouteError(error);
  }
}
