"use client";

import { useState, type FormEvent } from "react";

import { readErrorMessage } from "@/lib/client-response";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
        }),
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        setError(readErrorMessage(body, "Invalid credentials."));
        return;
      }

      window.location.assign("/dashboard");
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <div>
        <label className="block text-sm font-medium text-slate-800" htmlFor="email">
          Email
        </label>
        <input
          autoComplete="username"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
          id="email"
          name="email"
          required
          type="email"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-800" htmlFor="password">
          Password
        </label>
        <input
          autoComplete="current-password"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
          id="password"
          maxLength={128}
          minLength={12}
          name="password"
          required
          type="password"
        />
      </div>

      {error ? (
        <p
          aria-live="polite"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <button
        className="w-full rounded-lg bg-teal-800 px-4 py-2.5 font-medium text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
