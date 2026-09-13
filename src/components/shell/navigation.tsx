"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

export type NavigationGroup = Readonly<{
  label: string;
  items: readonly { href: string; label: string; icon: string }[];
}>;

function NavigationItems({
  groups,
  onNavigate,
}: Readonly<{ groups: readonly NavigationGroup[]; onNavigate?: () => void }>) {
  const pathname = usePathname();
  return (
    <div className="nav-groups">
      {groups.map((group) => (
        <div className="nav-group" key={group.label}>
          <p className="nav-group-label">{group.label}</p>
          <div className="nav-group-items">
            {group.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
              return (
                <a
                  aria-current={active ? "page" : undefined}
                  className={`nav-link${active ? " nav-link-active" : ""}`}
                  href={item.href}
                  key={item.href}
                  onClick={onNavigate}
                >
                  <span aria-hidden="true" className="nav-icon">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SidebarNavigation({ groups }: Readonly<{ groups: readonly NavigationGroup[] }>) {
  return <NavigationItems groups={groups} />;
}

export function MobileNavigation({
  groups,
  children,
}: Readonly<{ groups: readonly NavigationGroup[]; children: ReactNode }>) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const current = groups
    .flatMap((group) => group.items)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return (
    <>
      <header className="mobile-topbar">
        <Link className="mobile-brand" href="/dashboard">
          Clinic Management
        </Link>
        <span className="mobile-context">{current?.label ?? "Workspace"}</span>
        <button
          aria-expanded={open}
          aria-label="Open navigation"
          className="menu-button"
          onClick={() => setOpen(true)}
          type="button"
        >
          <span aria-hidden="true">☰</span>
        </button>
      </header>
      {open ? (
        <div className="mobile-nav-backdrop" onClick={() => setOpen(false)}>
          <aside
            aria-label="Mobile navigation"
            className="mobile-drawer"
            onClick={(event) => event.stopPropagation()}
            role="navigation"
          >
            <div className="mobile-drawer-header">
              <strong>Clinic Management</strong>
              <button
                aria-label="Close navigation"
                className="menu-button"
                onClick={() => setOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <NavigationItems groups={groups} onNavigate={() => setOpen(false)} />
            <div className="mobile-drawer-footer">{children}</div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
