import { NextRequest, NextResponse } from "next/server";

export function requiresPrivateNoStore(pathname: string): boolean {
  return (
    pathname === "/dashboard" ||
    pathname === "/patients" ||
    pathname.startsWith("/patients/") ||
    pathname === "/consultations" ||
    pathname.startsWith("/consultations/") ||
    pathname === "/follow-ups" ||
    pathname.startsWith("/follow-ups/") ||
    pathname === "/api/consultations" ||
    pathname.startsWith("/api/consultations/") ||
    pathname === "/api/follow-ups" ||
    pathname.startsWith("/api/follow-ups/")
  );
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDevelopment = process.env.NODE_ENV === "development";
  const upgradeInsecureRequests = isDevelopment ? "" : "upgrade-insecure-requests;";
  const contentSecurityPolicy = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""};
    style-src 'self' 'nonce-${nonce}';
    img-src 'self' blob: data:;
    font-src 'self';
    connect-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${upgradeInsecureRequests}
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  if (requiresPrivateNoStore(request.nextUrl.pathname)) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Pragma", "no-cache");
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
