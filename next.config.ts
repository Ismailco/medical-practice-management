import type { NextConfig } from "next";

import { parseEnvironment } from "./src/config/env.schema";

parseEnvironment(process.env);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const privateNoStoreHeaders = [
  { key: "Cache-Control", value: "private, no-store" },
  { key: "Pragma", value: "no-cache" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  async headers() {
    return [
      {
        source: "/consultations/:path*",
        headers: privateNoStoreHeaders,
      },
      {
        source: "/api/consultations/:path*",
        headers: privateNoStoreHeaders,
      },
      {
        source: "/follow-ups",
        headers: privateNoStoreHeaders,
      },
      {
        source: "/follow-ups/:path*",
        headers: privateNoStoreHeaders,
      },
      {
        source: "/api/follow-ups/:path*",
        headers: privateNoStoreHeaders,
      },
      {
        source: "/prescriptions/:path*",
        headers: privateNoStoreHeaders,
      },
      {
        source: "/api/prescriptions/:path*",
        headers: privateNoStoreHeaders,
      },
      {
        source: "/settings/practice",
        headers: privateNoStoreHeaders,
      },
      {
        source: "/api/settings/practice",
        headers: privateNoStoreHeaders,
      },
      {
        source: "/dashboard",
        headers: privateNoStoreHeaders,
      },
      {
        source: "/patients/:path*",
        headers: privateNoStoreHeaders,
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
