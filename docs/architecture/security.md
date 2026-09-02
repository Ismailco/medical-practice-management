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

Nonce-based CSP makes application rendering dynamic. This is an accepted trade-off for a future authenticated application containing sensitive information. New third-party origins require explicit review; do not weaken CSP globally to accommodate them.

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
