import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Clinic Management",
  description: "Open-source clinic-management foundation using synthetic data only.",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default async function RootLayout({ children }: RootLayoutProps) {
  // The nonce-bearing request headers must be read during rendering so Next.js
  // can attach the per-request CSP nonce to its generated scripts and styles.
  await headers();

  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
