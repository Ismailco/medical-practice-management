# Security architecture

## Security position

Security is a system property, not a production-readiness claim. The V1 repository is a synthetic-data demonstration. Real healthcare deployment requires independent security and applicable legal/compliance review.

## Foundation controls

- Environment configuration is validated on the server at startup.
- Database configuration is never exposed through `NEXT_PUBLIC_` variables.
- PostgreSQL binds to loopback in the development Compose setup.
- Liveness and readiness responses disclose only coarse status.
- Response headers disable MIME sniffing, framing, unnecessary browser capabilities, and referrer disclosure.
- A per-request nonce-based Content Security Policy is established at the Next.js proxy boundary.
- Production CSP upgrades insecure subresource requests.
- Logs are structured JSON with an intentionally narrow context type.
- Better Auth stores opaque sessions in PostgreSQL; authorization does not rely on client-held role claims.
- Credentials use Argon2id. Defaults are 65,536 KiB memory, 3 iterations, and parallelism 1.
- Session cookies are HttpOnly and SameSite=Lax, and are Secure when `APP_URL` is HTTPS.
- All application-owned authentication, staff-account, and patient mutations require an exact trusted `Origin`.
- All appointment, consultation, follow-up, prescription, and practice-profile reads require an authenticated session and capability; mutations and search operations require an exact trusted `Origin`.
- Login throttles are PostgreSQL-backed and survive application restarts.

Nonce-based CSP makes application rendering dynamic. This is an accepted trade-off for a future authenticated application containing sensitive information. New third-party origins require explicit review; do not weaken CSP globally to accommodate them.

## Authentication controls

Email is a normalized login identifier only. Email verification, email delivery, public registration, public recovery, and social login are disabled. Passwords accept 12 through 128 characters without composition rules. Production operators should benchmark Argon2id on their deployment hardware and increase memory or time cost while keeping authentication latency operationally acceptable; changes affect new hashes and password resets.

Sessions expire eight hours after issuance and can be refreshed in the database after 30 minutes of activity. Cookie session caching is disabled, so the database remains authoritative. Disabling a secretary deletes all their sessions in the same transaction. Every protected request also re-reads the user and expiry; an inactive user is rejected and any remaining sessions are removed.

SameSite=Lax prevents cookies on most cross-site subrequests. Better Auth additionally checks trusted origins and request metadata on its authentication operations. Application-owned state-changing routes require an exact `Origin` match against `APP_URL`. This assumes browsers provide `Origin` for these fetch requests and that operators configure the canonical origin correctly. CSP `form-action 'self'` adds defense in depth but is not the CSRF control.

Better Auth's database limiter atomically limits sign-in requests by client-IP/path. A second application table counts failed attempts by an HMAC of normalized identifier plus client IP and blocks after five failures in 15 minutes. It stores neither plaintext email nor IP. The pair limiter is intentionally skipped when production receives no trustworthy single client address, avoiding an easy global account lockout; Better Auth's IP limiter still applies. Production ingress must overwrite forwarded headers, prevent direct application access, and configure trusted proxies. Expired pair records are removed opportunistically; scheduled cleanup may be added later.

There is no self-service recovery. The doctor manages secretary credentials through an authorized operation. Initial doctor creation and doctor recovery use interactive operator commands. All password changes revoke the affected sessions.

## Authorization controls

Roles are `DOCTOR` and `SECRETARY`, but services authorize named capabilities through centralized policy. Both roles can read, create, and update administrative patient records. Patient archive and restore are doctor-only. Secretaries have no consultation, clinical-note, sensitive follow-up, prescription, audit, or staff-administration capability. Resource UUIDs are never treated as authorization.

Patient mutation inputs are strict Zod objects and database writes enumerate accepted fields. Submitted patient numbers, roles, clinical fields, and unknown properties are rejected. Archived-state and optimistic-concurrency checks execute in database transactions. Administrative DTO projections prevent internal search and lifecycle fields from leaking into browser responses.

Patient search terms are carried in a same-origin authenticated POST body, not the URL, because names, phone numbers, and emails in query strings would commonly enter proxy and access logs. Request-body logging remains prohibited.

Appointment input uses strict schemas and dedicated create, reschedule, and transition operations. Clients cannot set initial status, creator, audit actor, or arbitrary appointment fields. Appointment DTOs contain only the administrative patient identity and schedule fields needed by staff. Patient-picker terms use a same-origin POST and are not placed in URLs. The optional administrative reason is not a clinical-notes field and must not be used for sensitive clinical content.

Secretary and doctor appointment capabilities are explicit. Both manage ordinary scheduling and administrative transitions; only the doctor has `appointments.transition_visit` for `IN_CONSULTATION` and `COMPLETED`. The server recalculates overlaps even after client confirmation and applies optimistic concurrency to reschedules and transitions.

Consultation and clinical-note capabilities are doctor-only. Authorization occurs before consultation lookup in transport adapters. Secretary navigation, patient pages, patient DTOs, and appointment DTOs contain no consultation count, identifier, state, diagnosis, note, or existence indicator. Strict dedicated operations are the only clinical mutation paths.

Follow-up read, create, update, complete, and cancel capabilities are doctor-only. Authorization occurs before record lookup. Secretary navigation, dashboards, patient pages, administrative DTOs, and appointment responses contain no follow-up count, indicator, identifier, reason, or existence signal. Consultation-linked creation derives its patient server-side and is backed by a composite ownership foreign key.

Clinical responses use `Cache-Control: private, no-store` and `Pragma: no-cache`; clinical pages also receive the route-level private/no-store policy. Clinical text is plain text rendered through React escaping, never `dangerouslySetInnerHTML`, and is never stored in browser storage. Only the current editor snapshot is sent to its Client Component; history remains server rendered.

Follow-up APIs and pages use the same private/no-store policy. Dashboard and patient routes that may render doctor-only follow-up state are also explicitly private/no-store. Reasons are escaped plain text and are not placed in URLs, query strings, browser storage, shared caches, audit metadata, or application logs.

Prescription read, mutation, and PDF-generation capabilities are doctor-only and authorization precedes lookup. Secretary navigation, dashboards, patient DTOs, consultation responses, and settings paths contain no prescription existence, counts, identifiers, or medication content. Prescription fields are bounded plain text and rendered through React escaping. Issued PDFs use only the immutable issue snapshot and finalized items, return `private, no-store` with a prescription-number-only filename, and are held transiently by the browser. No medication value, issue snapshot value, or payload enters logs, URLs, browser storage, response headers, or audit metadata.

## Security audit events

The `audit_log` records authentication outcomes, staff-account lifecycle actions, patient and appointment mutations, consultation creation, revision creation, finalization, addendum creation, follow-up lifecycle changes, prescription lifecycle operations, PDF generation, and practice-profile updates. Clinical metadata is allow-listed to lifecycle state, resulting version, renderer/template version, page count, changed field names, item count, and relationship booleans. It excludes clinical and prescription text, patient identity, dates, profile values, full objects, request bodies, and PDF bytes. A PDF generation event means the server produced the document; it does not claim that a physical printer completed a job. PostgreSQL triggers reject historical updates and deletes. Database owners can still alter records, so database access and external log export remain production responsibilities. No user-facing audit browser exists yet.

## Logging rules

Application logs may contain operational fields such as request ID, route name, status code, duration, and a non-sensitive error code.

They must never contain:

- Request or response bodies by default.
- Patient or clinical text.
- Passwords or password hashes.
- Session identifiers, cookies, or CSRF tokens.
- Database URLs, secrets, or encryption keys.

Future error tracking must apply the same rules and be tested for redaction. Audit logs are a separate domain and must not become a copy of clinical records.

Emergency-contact details describe a third party and are personal data. They receive the same logging, access-control, backup, and disclosure protections as the patient's administrative information.

## Infrastructure responsibilities

The application does not terminate public TLS or secure the host by itself. A future production operator is responsible for:

- HTTPS and an appropriate HSTS policy at the ingress.
- Private database networking and least-privilege database roles.
- Operating-system, container, database, and dependency patching.
- Encrypted, access-controlled, restore-tested backups.
- Secret storage and rotation.
- Monitoring, alerting, incident response, and workstation security.

HSTS is not emitted by the development application because advertising it from an incorrectly configured origin can cause operational harm. Enable it only at a production HTTPS ingress after reviewing domain and subdomain scope.

## Encryption boundaries

TLS, encrypted database storage, and encrypted backups are the baseline for future production. They protect transport and lost storage media but do not protect against a compromised running application or an authorized database session.

Application-level encryption of clinical fields is deferred until a deployment threat model and key-management design exist. If adopted, it must use maintained authenticated-encryption libraries and envelope keys held outside the database, preferably in a KMS or HSM. A static key beside the database password is not an acceptable substitute.

Clinical revisions and addenda are plaintext at the application/database layer in V1. “Secure clinical notes” describes authorization, disclosure boundaries, no-store caching, append-only history, safe logging, and production encryption expectations; it is not a claim of end-to-end encryption or automatic legal compliance.

## Synthetic-data rule

THIS REPOSITORY MUST NEVER CONTAIN REAL PATIENT DATA. Fixtures, seeds, screenshots, bug reports, and examples must be synthetic and must not be derived from identifiable people.

## Beta release hardening

Browser E2E setup uses a separate `.env.test.example` and the same destructive database guard as the
integration suite. Reset preparation requires `NODE_ENV=test`, `ALLOW_TEST_DATABASE_RESET=true`, and a
PostgreSQL database name ending in `_test`; the normal development/demo database is rejected before any
truncate. Production configuration rejects test-reset and demo-seed flags.

Clinical and prescription responses remain private/no-store. The browser only holds generated PDF bytes
transiently in an object URL, which is revoked by the PDF action component; clinical content is not stored
in localStorage, sessionStorage, IndexedDB, or a service-worker cache. PDF printing is delegated to the
browser and is not represented as proof that a physical printer completed a job.
