import "server-only";

import { ZodError } from "zod";

import { safeRouteError } from "@/modules/auth/http";

export function followUpJson(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function followUpRouteError(error: unknown): Response {
  if (!(error instanceof ZodError)) {
    const response = safeRouteError(error);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Pragma", "no-cache");
    return response;
  }

  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) fieldErrors[field] = issue.message;
  }
  return followUpJson(
    { error: "Please correct the highlighted fields.", fieldErrors },
    { status: 400 },
  );
}
