"use client";

import { useState } from "react";

export function LogoutButton() {
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/login");
    }
  }

  return (
    <button className="btn btn-secondary w-full" disabled={pending} onClick={logout} type="button">
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
