import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/logout-button";
import { hasCapability } from "@/modules/auth/capabilities";
import { getCurrentSession } from "@/modules/auth/session";

export default async function ProtectedLayout({ children }: Readonly<{ children: ReactNode }>) {
  const currentSession = await getCurrentSession();
  if (!currentSession) redirect("/login");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-6">
            <Link className="font-semibold text-slate-950" href="/dashboard">
              Clinic Management
            </Link>
            <Link className="text-sm text-slate-600 hover:text-slate-950" href="/patients">
              Patients
            </Link>
            <Link className="text-sm text-slate-600 hover:text-slate-950" href="/appointments">
              Appointments
            </Link>
            {hasCapability(currentSession.user.role, "users.manage_secretaries") ? (
              <Link className="text-sm text-slate-600 hover:text-slate-950" href="/settings/users">
                Staff accounts
              </Link>
            ) : null}
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
