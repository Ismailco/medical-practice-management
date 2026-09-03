"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { readErrorMessage } from "@/lib/client-response";

type Secretary = Readonly<{
  id: string;
  name: string;
  email: string;
  active: boolean;
  createdAt: string;
}>;

type Props = Readonly<{ users: readonly Secretary[] }>;

export function UserManagement({ users }: Props) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function send(url: string, method: "POST" | "PATCH", body: unknown) {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(readErrorMessage(result, "The operation could not be completed."));
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPendingKey("create");
    setMessage(null);

    try {
      await send("/api/settings/users", "POST", {
        name: data.get("name"),
        email: data.get("email"),
        password: data.get("password"),
      });
      form.reset();
      setMessage("Secretary account created.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The operation could not be completed.");
    } finally {
      setPendingKey(null);
    }
  }

  async function update(userId: string, body: unknown, key: string) {
    setPendingKey(key);
    setMessage(null);
    try {
      await send(`/api/settings/users/${userId}`, "PATCH", body);
      setMessage("Account updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The operation could not be completed.");
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">Secretary accounts</h2>
        <div className="mt-5 space-y-4">
          {users.length === 0 ? (
            <p className="text-sm text-slate-600">No secretary accounts.</p>
          ) : null}
          {users.map((user) => (
            <article className="rounded-lg border border-slate-200 p-4" key={user.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-slate-950">{user.name}</h3>
                  <p className="text-sm text-slate-600">{user.email}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${user.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
                >
                  {user.active ? "Active" : "Disabled"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
                  disabled={pendingKey !== null}
                  onClick={() =>
                    update(
                      user.id,
                      { action: user.active ? "disable" : "enable" },
                      `${user.id}:status`,
                    )
                  }
                  type="button"
                >
                  {user.active ? "Disable" : "Enable"}
                </button>
              </div>
              <form
                className="mt-4 flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void update(
                    user.id,
                    { action: "reset_password", password: data.get("password") },
                    `${user.id}:password`,
                  );
                  event.currentTarget.reset();
                }}
              >
                <label className="sr-only" htmlFor={`password-${user.id}`}>
                  New password for {user.name}
                </label>
                <input
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  id={`password-${user.id}`}
                  maxLength={128}
                  minLength={12}
                  name="password"
                  placeholder="New password"
                  required
                  type="password"
                />
                <button
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
                  disabled={pendingKey !== null}
                  type="submit"
                >
                  Set password
                </button>
              </form>
            </article>
          ))}
        </div>
      </section>

      <section className="h-fit rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">Create secretary</h2>
        <form className="mt-5 space-y-4" onSubmit={create}>
          <label className="block text-sm font-medium text-slate-700">
            Name
            <input
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
              maxLength={100}
              minLength={2}
              name="name"
              required
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              autoComplete="off"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
              maxLength={254}
              name="email"
              required
              type="email"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Initial password
            <input
              autoComplete="new-password"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
              maxLength={128}
              minLength={12}
              name="password"
              required
              type="password"
            />
          </label>
          <button
            className="w-full rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={pendingKey !== null}
            type="submit"
          >
            {pendingKey === "create" ? "Creating…" : "Create secretary"}
          </button>
        </form>
        {message ? (
          <p aria-live="polite" className="mt-4 text-sm text-slate-700">
            {message}
          </p>
        ) : null}
      </section>
    </div>
  );
}
