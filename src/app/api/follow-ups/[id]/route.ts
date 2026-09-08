import { requireCapability } from "@/modules/auth/session";
import { followUpJson, followUpRouteError } from "@/modules/follow-ups/http";
import { findFollowUpDetail } from "@/modules/follow-ups/repository";
import { followUpIdSchema } from "@/modules/follow-ups/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    await requireCapability("followups.read_sensitive", request.headers);
    const id = followUpIdSchema.parse((await context.params).id);
    const record = await findFollowUpDetail(id);
    return record
      ? followUpJson({ followUp: record })
      : followUpJson({ error: "Not found." }, { status: 404 });
  } catch (error) {
    return followUpRouteError(error);
  }
}
