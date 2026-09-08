import { requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { prescriptionRouteError } from "@/modules/prescriptions/http";
import { generatePrescriptionPdf } from "@/modules/prescriptions/service";
import { prescriptionIdSchema } from "@/modules/prescriptions/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    const actor = await requireCapability("prescriptions.pdf_generate", request.headers);
    const id = prescriptionIdSchema.parse((await context.params).id);
    const result = await generatePrescriptionPdf(id, actor);
    const headers = new Headers({
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      Pragma: "no-cache",
      "Content-Disposition": `inline; filename="${result.filename}"`,
      "X-Content-Type-Options": "nosniff",
    });
    return new Response(new Uint8Array(result.bytes), { status: 200, headers });
  } catch (error) {
    return prescriptionRouteError(error);
  }
}
