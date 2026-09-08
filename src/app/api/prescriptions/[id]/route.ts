import { requireCapability } from "@/modules/auth/session";
import { prescriptionJson, prescriptionRouteError } from "@/modules/prescriptions/http";
import { findPrescriptionDetail } from "@/modules/prescriptions/repository";
import { prescriptionIdSchema } from "@/modules/prescriptions/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    await requireCapability("prescriptions.read", request.headers);
    const id = prescriptionIdSchema.parse((await context.params).id);
    const record = await findPrescriptionDetail(id);
    return record
      ? prescriptionJson({ prescription: record })
      : prescriptionJson({ error: "Not found." }, { status: 404 });
  } catch (error) {
    return prescriptionRouteError(error);
  }
}
