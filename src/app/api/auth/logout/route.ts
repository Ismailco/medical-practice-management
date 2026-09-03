import { env } from "@/config/env";
import { logError } from "@/lib/logger";
import { recordAuditEvent } from "@/modules/audit/service";
import { auth } from "@/modules/auth/auth";
import { ForbiddenError } from "@/modules/auth/errors";
import { copySetCookieHeaders, noStoreJson, requireTrustedOrigin } from "@/modules/auth/http";
import { getCurrentSession } from "@/modules/auth/session";

export const runtime = "nodejs";

async function handleLogout(request: Request): Promise<Response> {
  requireTrustedOrigin(request);
  const currentSession = await getCurrentSession(request.headers);
  const headers = new Headers(request.headers);
  headers.delete("content-length");

  const authResponse = await auth.handler(
    new Request(new URL("/api/auth/sign-out", env.APP_URL), {
      method: "POST",
      headers,
    }),
  );

  if (currentSession) {
    await recordAuditEvent({
      actorUserId: currentSession.user.id,
      action: "AUTH_LOGOUT",
      entityType: "user",
      entityId: currentSession.user.id,
      metadata: {},
    });
  }

  const responseHeaders = new Headers({ "Cache-Control": "no-store" });
  copySetCookieHeaders(authResponse, responseHeaders);
  return new Response(null, { status: 204, headers: responseHeaders });
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleLogout(request);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return noStoreJson({ error: "Forbidden." }, { status: 403 });
    }

    logError("Logout operation failed", { errorCode: "LOGOUT_OPERATION_FAILED" });
    return noStoreJson({ error: "Unable to sign out." }, { status: 503 });
  }
}
