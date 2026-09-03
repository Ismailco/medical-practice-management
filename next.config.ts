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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  async headers() {
    return [
      {
        source: "/consultations/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/api/consultations/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
