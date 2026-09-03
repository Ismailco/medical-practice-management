import { requireCapability } from "@/modules/auth/session";
import { clinicalJson, consultationRouteError } from "@/modules/consultations/http";
import { findConsultationDetail } from "@/modules/consultations/repository";
import { consultationIdSchema } from "@/modules/consultations/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    await requireCapability("consultations.read", request.headers);
    const id = consultationIdSchema.parse((await context.params).id);
    const record = await findConsultationDetail(id);
    return record
      ? clinicalJson({ consultation: record })
      : clinicalJson({ error: "Not found." }, { status: 404 });
  } catch (error) {
    return consultationRouteError(error);
  }
}
