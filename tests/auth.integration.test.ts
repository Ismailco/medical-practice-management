import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as listUsers, POST as createUser } from "@/app/api/settings/users/route";
import { PATCH as updateUser } from "@/app/api/settings/users/[id]/route";
import { db, sqlClient } from "@/db/client";
import { account, auditLog, loginThrottle, session, user } from "@/db/schema";
import { getCurrentSession } from "@/modules/auth/session";
import { createInitialDoctor, createSecretary, resetDoctorPassword } from "@/modules/users/service";

const origin = "https://clinic.test";
const doctorPassword = "Synthetic doctor passphrase 2026";
const secretaryPassword = "Synthetic secretary passphrase 2026";

type StaffFixture = Readonly<{ id: string; email: string }>;

let doctor: StaffFixture;
let secretary: StaffFixture;

function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    origin?: string;
    ip?: string;
  } = {},
): Request {
  const headers = new Headers({
    "content-type": "application/json",
    origin: options.origin ?? origin,
    "x-forwarded-for": options.ip ?? "192.0.2.10",
  });
  if (options.cookie) headers.set("cookie", options.cookie);

  return new Request(`${origin}${path}`, {
    method: options.method ?? "POST",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

async function signIn(email: string, password: string, ip = "192.0.2.10") {
  const response = await login(request("/api/auth/login", { body: { email, password }, ip }));
  return { response, cookie: cookieHeader(response) };
}

async function resetDatabase(): Promise<void> {
  await sqlClient`
    TRUNCATE TABLE
      audit_log,
      login_throttle,
      auth_rate_limit,
      auth_verification,
      auth_session,
      auth_account,
      auth_user
    RESTART IDENTITY CASCADE
  `;
}

beforeEach(async () => {
  await resetDatabase();
  doctor = await createInitialDoctor({
    name: "Synthetic Doctor",
    email: "doctor@example.test",
    password: doctorPassword,
  });
  secretary = await createSecretary(
    {
      name: "Synthetic Secretary",
      email: "secretary@example.test",
      password: secretaryPassword,
    },
    doctor.id,
  );
});

afterAll(async () => {
  await resetDatabase();
  await sqlClient.end();
});

describe("database-backed authentication", () => {
  it("logs in both roles and returns only a secure session cookie and safe session DTO", async () => {
    const doctorLogin = await signIn(doctor.email, doctorPassword, "192.0.2.11");
    const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.12");

    expect(doctorLogin.response.status).toBe(200);
    expect(secretaryLogin.response.status).toBe(200);
    expect(await doctorLogin.response.json()).toEqual({ ok: true });

    const setCookie = doctorLogin.response.headers.getSetCookie().join("; ");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=28800");
    expect(setCookie).not.toContain(doctorPassword);

    const current = await getCurrentSession(new Headers({ cookie: doctorLogin.cookie }));
    expect(current?.user).toEqual({
      id: doctor.id,
      name: "Synthetic Doctor",
      email: doctor.email,
      role: "DOCTOR",
    });
    expect(current).not.toHaveProperty("token");
    expect(current?.user).not.toHaveProperty("password");
    expect(await getCurrentSession(new Headers({ cookie: secretaryLogin.cookie }))).toMatchObject({
      user: { id: secretary.id, role: "SECRETARY" },
    });
  });

  it("uses indistinguishable failures and enforces CSRF origin validation", async () => {
    const badPassword = await signIn(doctor.email, "incorrect synthetic password", "192.0.2.20");
    const unknownUser = await signIn(
      "unknown@example.test",
      "incorrect synthetic password",
      "192.0.2.21",
    );
    const crossOrigin = await login(
      request("/api/auth/login", {
        body: { email: doctor.email, password: doctorPassword },
        origin: "https://attacker.example",
        ip: "192.0.2.22",
      }),
    );

    expect(badPassword.response.status).toBe(401);
    expect(unknownUser.response.status).toBe(401);
    expect(await badPassword.response.json()).toEqual({ error: "Invalid credentials." });
    expect(await unknownUser.response.json()).toEqual({ error: "Invalid credentials." });
    expect(crossOrigin.status).toBe(401);
    expect(await crossOrigin.json()).toEqual({ error: "Invalid credentials." });
  });

  it("persists failed-login throttling and clears a non-blocked bucket after success", async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const failed = await signIn(doctor.email, "incorrect synthetic password", "192.0.2.30");
      expect(failed.response.status).toBe(401);
    }
    const throttled = await signIn(doctor.email, "incorrect synthetic password", "192.0.2.30");
    expect(throttled.response.status).toBe(429);
    expect(await db.select().from(loginThrottle)).toHaveLength(1);

    const stillThrottled = await signIn(doctor.email, doctorPassword, "192.0.2.30");
    expect(stillThrottled.response.status).toBe(429);

    await signIn(doctor.email, "incorrect synthetic password", "192.0.2.31");
    const successful = await signIn(doctor.email, doctorPassword, "192.0.2.31");
    expect(successful.response.status).toBe(200);
    const remaining = await db.select().from(loginThrottle);
    expect(remaining).toHaveLength(1);
  });

  it("allows only doctors to create secretaries and rejects role injection and duplicates", async () => {
    const doctorLogin = await signIn(doctor.email, doctorPassword, "192.0.2.40");
    const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.41");
    const payload = {
      name: "Second Synthetic Secretary",
      email: "second@example.test",
      password: "Another synthetic passphrase 2026",
    };

    const forbidden = await createUser(
      request("/api/settings/users", { body: payload, cookie: secretaryLogin.cookie }),
    );
    expect(forbidden.status).toBe(403);

    const injected = await createUser(
      request("/api/settings/users", {
        body: { ...payload, role: "DOCTOR" },
        cookie: doctorLogin.cookie,
      }),
    );
    expect(injected.status).toBe(400);

    const created = await createUser(
      request("/api/settings/users", { body: payload, cookie: doctorLogin.cookie }),
    );
    expect(created.status).toBe(201);

    const duplicate = await createUser(
      request("/api/settings/users", { body: payload, cookie: doctorLogin.cookie }),
    );
    expect(duplicate.status).toBe(409);

    const listed = await listUsers(
      request("/api/settings/users", { method: "GET", cookie: doctorLogin.cookie }),
    );
    expect(listed.status).toBe(200);
    const doctors = await db.select().from(user).where(eq(user.role, "DOCTOR"));
    expect(doctors).toHaveLength(1);
  });

  it("invalidates sessions on disable and password reset, and supports re-enabling", async () => {
    const doctorLogin = await signIn(doctor.email, doctorPassword, "192.0.2.50");
    const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.51");
    const routeContext = { params: Promise.resolve({ id: secretary.id }) };

    const disabled = await updateUser(
      request(`/api/settings/users/${secretary.id}`, {
        method: "PATCH",
        body: { action: "disable" },
        cookie: doctorLogin.cookie,
      }),
      routeContext,
    );
    expect(disabled.status).toBe(200);
    expect(await getCurrentSession(new Headers({ cookie: secretaryLogin.cookie }))).toBeNull();
    expect((await signIn(secretary.email, secretaryPassword, "192.0.2.52")).response.status).toBe(
      401,
    );

    const enabled = await updateUser(
      request(`/api/settings/users/${secretary.id}`, {
        method: "PATCH",
        body: { action: "enable" },
        cookie: doctorLogin.cookie,
      }),
      routeContext,
    );
    expect(enabled.status).toBe(200);
    const enabledLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.53");
    expect(enabledLogin.response.status).toBe(200);

    const newPassword = "Replacement synthetic passphrase 2026";
    const reset = await updateUser(
      request(`/api/settings/users/${secretary.id}`, {
        method: "PATCH",
        body: { action: "reset_password", password: newPassword },
        cookie: doctorLogin.cookie,
      }),
      routeContext,
    );
    expect(reset.status).toBe(200);
    expect(await getCurrentSession(new Headers({ cookie: enabledLogin.cookie }))).toBeNull();
    expect((await signIn(secretary.email, secretaryPassword, "192.0.2.54")).response.status).toBe(
      401,
    );
    expect((await signIn(secretary.email, newPassword, "192.0.2.55")).response.status).toBe(200);
  });

  it("revokes logout and expired sessions", async () => {
    const loggedIn = await signIn(doctor.email, doctorPassword, "192.0.2.60");
    const loggedOut = await logout(
      request("/api/auth/logout", { cookie: loggedIn.cookie, ip: "192.0.2.60" }),
    );
    expect(loggedOut.status).toBe(204);
    expect(await getCurrentSession(new Headers({ cookie: loggedIn.cookie }))).toBeNull();

    const relogged = await signIn(doctor.email, doctorPassword, "192.0.2.61");
    await db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(session.userId, doctor.id));
    expect(await getCurrentSession(new Headers({ cookie: relogged.cookie }))).toBeNull();
  });

  it("supports operator doctor recovery and revokes existing sessions", async () => {
    const loggedIn = await signIn(doctor.email, doctorPassword, "192.0.2.65");
    const replacement = "Recovered synthetic doctor passphrase 2026";

    await resetDoctorPassword({ email: doctor.email, password: replacement });

    expect(await getCurrentSession(new Headers({ cookie: loggedIn.cookie }))).toBeNull();
    expect((await signIn(doctor.email, doctorPassword, "192.0.2.66")).response.status).toBe(401);
    expect((await signIn(doctor.email, replacement, "192.0.2.67")).response.status).toBe(200);
  });

  it("records security events without secrets and enforces audit immutability", async () => {
    await signIn(doctor.email, doctorPassword, "192.0.2.70");
    await signIn(doctor.email, "incorrect synthetic password", "192.0.2.71");

    const events = await db.select().from(auditLog);
    expect(events.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "USER_DOCTOR_BOOTSTRAPPED",
        "USER_SECRETARY_CREATED",
        "AUTH_LOGIN_SUCCEEDED",
        "AUTH_LOGIN_FAILED",
      ]),
    );
    expect(JSON.stringify(events)).not.toContain(doctorPassword);
    expect(JSON.stringify(events)).not.toContain("incorrect synthetic password");

    await expect(
      db
        .update(auditLog)
        .set({ entityType: "changed" })
        .where(and(eq(auditLog.entityType, "authentication"), sql`true`)),
    ).rejects.toThrow();
    expect(await db.select().from(auditLog).where(eq(auditLog.entityType, "changed"))).toHaveLength(
      0,
    );

    const credentials = await db
      .select({ password: account.password })
      .from(account)
      .where(eq(account.userId, doctor.id));
    expect(credentials[0]?.password).toMatch(/^\$argon2id\$/);
    expect(credentials[0]?.password).not.toBe(doctorPassword);
  });
});
