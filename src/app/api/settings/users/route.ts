import { createSecretarySchema } from "@/modules/users/validation";
import { requireCapability } from "@/modules/auth/session";
import { noStoreJson, requireTrustedOrigin, safeRouteError } from "@/modules/auth/http";
import { createSecretary, listSecretaries } from "@/modules/users/service";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireCapability("users.manage_secretaries", request.headers);
    return noStoreJson({ users: await listSecretaries() });
  } catch (error) {
    return safeRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    const actor = await requireCapability("users.manage_secretaries", request.headers);
    const input = createSecretarySchema.parse(await request.json().catch(() => null));
    const secretary = await createSecretary(input, actor.id);
    return noStoreJson({ user: secretary }, { status: 201 });
  } catch (error) {
    return safeRouteError(error);
  }
}
