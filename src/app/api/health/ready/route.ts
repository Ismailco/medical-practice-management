import { checkDatabaseConnection } from "@/db/client";
import { logWarning } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await checkDatabaseConnection();

    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    logWarning("Readiness check failed", {
      route: "/api/health/ready",
      statusCode: 503,
      errorCode: "DATABASE_UNAVAILABLE",
    });

    return Response.json(
      { status: "unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
