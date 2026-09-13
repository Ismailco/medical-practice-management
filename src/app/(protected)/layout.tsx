import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/logout-button";
import {
  MobileNavigation,
  SidebarNavigation,
  type NavigationGroup,
} from "@/components/shell/navigation";
import { hasCapability } from "@/modules/auth/capabilities";
import { getCurrentSession } from "@/modules/auth/session";
import { roleLabels } from "@/lib/presentation";

export default async function ProtectedLayout({ children }: Readonly<{ children: ReactNode }>) {
  const currentSession = await getCurrentSession();
  if (!currentSession) redirect("/login");

  const role = currentSession.user.role;
  const groups: NavigationGroup[] = [
    {
      label: "Workspace",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "▦" },
        { href: "/patients", label: "Patients", icon: "♙" },
        { href: "/appointments", label: "Appointments", icon: "◷" },
      ],
    },
    {
      label: "Clinical",
      items: [
        ...(hasCapability(role, "consultations.read")
          ? [{ href: "/consultations", label: "Consultations", icon: "✚" }]
          : []),
        ...(hasCapability(role, "followups.read_sensitive")
          ? [{ href: "/follow-ups", label: "Follow-ups", icon: "↗" }]
          : []),
        ...(hasCapability(role, "prescriptions.read")
          ? [{ href: "/prescriptions", label: "Prescriptions", icon: "▤" }]
          : []),
      ],
    },
    {
      label: "Administration",
      items: [
        ...(hasCapability(role, "users.manage_secretaries")
          ? [{ href: "/settings/users", label: "Staff accounts", icon: "♧" }]
          : []),
        ...(hasCapability(role, "practice_profile.manage")
          ? [{ href: "/settings/practice", label: "Practice profile", icon: "⚙" }]
          : []),
      ],
    },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Primary navigation">
        <Link className="brand-lockup" href="/dashboard">
          <span className="brand-name">Clinic Management</span>
          <span className="brand-subtitle">Staff workspace</span>
        </Link>
        <SidebarNavigation groups={groups} />
        <div className="sidebar-account">
          <div className="sidebar-account-name">{currentSession.user.name}</div>
          <div className="sidebar-account-role">{roleLabels[role]}</div>
          <LogoutButton />
        </div>
      </aside>
      <MobileNavigation groups={groups}>
        <div className="sidebar-account-name">{currentSession.user.name}</div>
        <div className="sidebar-account-role">{roleLabels[role]}</div>
        <LogoutButton />
      </MobileNavigation>
      <main className="app-main">
        <div className="app-content">{children}</div>
      </main>
    </div>
  );
}
