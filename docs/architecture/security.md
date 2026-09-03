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
- All application-owned authentication and staff-account mutations require an exact trusted `Origin`.
- Login throttles are PostgreSQL-backed and survive application restarts.

Nonce-based CSP makes application rendering dynamic. This is an accepted trade-off for a future authenticated application containing sensitive information. New third-party origins require explicit review; do not weaken CSP globally to accommodate them.

## Authentication controls

Email is a normalized login identifier only. Email verification, email delivery, public registration, public recovery, and social login are disabled. Passwords accept 12 through 128 characters without composition rules. Production operators should benchmark Argon2id on their deployment hardware and increase memory or time cost while keeping authentication latency operationally acceptable; changes affect new hashes and password resets.

Sessions expire eight hours after issuance and can be refreshed in the database after 30 minutes of activity. Cookie session caching is disabled, so the database remains authoritative. Disabling a secretary deletes all their sessions in the same transaction. Every protected request also re-reads the user and expiry; an inactive user is rejected and any remaining sessions are removed.

SameSite=Lax prevents cookies on most cross-site subrequests. Better Auth additionally checks trusted origins and request metadata on its authentication operations. Application-owned state-changing routes require an exact `Origin` match against `APP_URL`. This assumes browsers provide `Origin` for these fetch requests and that operators configure the canonical origin correctly. CSP `form-action 'self'` adds defense in depth but is not the CSRF control.

Better Auth's database limiter atomically limits sign-in requests by client-IP/path. A second application table counts failed attempts by an HMAC of normalized identifier plus client IP and blocks after five failures in 15 minutes. It stores neither plaintext email nor IP. The pair limiter is intentionally skipped when production receives no trustworthy single client address, avoiding an easy global account lockout; Better Auth's IP limiter still applies. Production ingress must overwrite forwarded headers, prevent direct application access, and configure trusted proxies. Expired pair records are removed opportunistically; scheduled cleanup may be added later.

There is no self-service recovery. The doctor manages secretary credentials through an authorized operation. Initial doctor creation and doctor recovery use interactive operator commands. All password changes revoke the affected sessions.

## Authorization controls

Roles are `DOCTOR` and `SECRETARY`, but services authorize named capabilities through centralized policy. Secretary capabilities are limited to the shell and future patient-administrative/appointment operations. No consultation, clinical-note, sensitive follow-up, prescription, audit, or staff-administration capability is granted. Better Auth role and active fields reject client input, and secretary creation hard-codes the role server-side.

## Security audit events

The minimal `audit_log` records authentication outcomes and staff-account lifecycle actions. Metadata is allow-listed by each call and excludes credentials, cookies, tokens, request bodies, and raw login identifiers. A PostgreSQL trigger rejects application updates and deletes. Database owners can still alter records, so database access and external log export remain production responsibilities. No user-facing audit browser exists yet.

## Logging rules

Application logs may contain operational fields such as request ID, route name, status code, duration, and a non-sensitive error code.

They must never contain:

- Request or response bodies by default.
- Patient or clinical text.
- Passwords or password hashes.
- Session identifiers, cookies, or CSRF tokens.
- Database URLs, secrets, or encryption keys.

Future error tracking must apply the same rules and be tested for redaction. Audit logs are a separate domain and must not become a copy of clinical records.

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

## Synthetic-data rule

THIS REPOSITORY MUST NEVER CONTAIN REAL PATIENT DATA. Fixtures, seeds, screenshots, bug reports, and examples must be synthetic and must not be derived from identifiable people.
