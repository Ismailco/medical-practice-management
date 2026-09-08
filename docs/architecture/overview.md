# Architecture overview

## Status and scope

The application is a modular monolith for one clinic, one doctor, and one or more secretaries. Phase 7 provides authentication, staff administration, administrative patient records, appointment scheduling, doctor-only consultations with immutable clinical-note history, doctor-only follow-up management, immutable doctor-only prescription history, and server-generated prescription PDFs.

The public project and demonstration use synthetic data only. Production readiness and regulatory compliance are explicitly outside the V1 demonstration claim.

## Runtime shape

```text
Browser
  -> HTTPS ingress or reverse proxy
  -> Next.js Node application
  -> PostgreSQL
```

The Next.js application owns server-rendered UI, same-origin mutations, authentication endpoints, domain services, authorization policies, database access, audit recording, and future prescription rendering. Modules communicate through TypeScript boundaries and database transactions, not internal HTTP.

## Code boundaries

- `src/app`: routing, layouts, and transport adapters.
- `src/modules`: feature-owned policy, service, repository, DTO, validation, and UI code as phases add them.
- `src/db`: server-only database client and schema.
- `src/config`: validated server configuration.
- `src/lib`: small shared infrastructure with no domain rules.

Server Components are the default. Client Components are reserved for stateful browser interaction. Database rows are never passed directly to client code; purpose-specific DTOs define disclosure boundaries.

## Request flow

Protected operations follow this order:

1. Authenticate a database-backed session.
2. Re-read the user and confirm the account is active.
3. Validate external input.
4. Authorize a named capability and resource.
5. Run the domain service and database transaction.
6. Record a safe audit event where required.
7. Return a minimal DTO.

UI visibility is not an authorization control.

## Authentication boundary

Only `/api/auth/login` and `/api/auth/logout` are publicly mounted authentication mutations. They call Better Auth internally, so the library's credential and session implementation is retained without exposing registration, recovery, or provider endpoints. Staff administration is application-owned under `/api/settings/users` and requires `users.manage_secretaries` on every operation.

The server session layer returns a deliberately small DTO containing user ID, name, normalized email, role, and session expiry. Password hashes, session tokens, throttle rows, and Better Auth internals never cross the server boundary.

## Patient boundary

The patient module owns strict administrative validation, explicit DTOs, bounded PostgreSQL queries, lifecycle rules, and transactional mutations. Initial list data is server-rendered. Interactive search uses an authenticated POST so personal search terms do not enter URLs. Database rows and internal normalization fields do not pass directly to client components.

One application/database deployment is the V1 clinic boundary. There is no tenant selector or `clinic_id`; multi-clinic storage is unsupported and cannot be inferred from UUID opacity.

## Appointment boundary

The appointment module owns clinic-local time conversion, daily agenda boundaries, overlap detection, lifecycle policy, explicit administrative DTOs, and transactional mutations. The database stores UTC instants through `timestamptz`; `CLINIC_TIMEZONE` supplies the IANA interpretation boundary. Appointment reason text is short administrative context and must not contain clinical information.

Overlap is a recalculated workflow warning rather than a uniqueness constraint because the one doctor may deliberately double-book. Appointment state and schedule changes use explicit versions. Cancellation and no-show preserve the record; no delete operation exists.

## Consultation boundary

The consultation module owns doctor-only clinical validation, explicit clinical DTOs, transactional services, immutable revisions, finalization, and addenda. It never extends administrative patient or appointment DTOs with clinical existence or content.

Starting from an appointment atomically creates the consultation and moves an arrived appointment to `IN_CONSULTATION`. Finalization freezes the current revision and completes the linked appointment in the same transaction. Direct consultations omit the appointment. Patient-row locking coordinates all starts with patient archival.

Clinical pages are dynamically rendered with private, no-store cache policy. Server Components render history and finalized content as escaped plain text; only the active editor fields cross into a Client Component. No browser persistence or rich-text/HTML rendering is used.

## Follow-up boundary

The follow-up module owns doctor-only sensitive reasons, clinic-local due-date classification, explicit DTOs, pending-record corrections, and terminal completion/cancellation. A consultation link is optional and does not mutate consultation content; linked creation derives the patient from the consultation, while a composite database foreign key prevents cross-patient links.

Patient-row locking coordinates creation with archival. Pending work blocks archival, while completed and cancelled history remains immutable and does not. Dashboard, patient, consultation, API, and navigation integrations authorize follow-up capabilities before loading follow-up DTOs. No reminder, messaging, calendar, or notification infrastructure exists.

## Prescription boundary

The prescription module is documentation-only: doctors enter medication content, save drafts, issue immutable records, and regenerate A4 PDFs. It owns transactional numbering, draft/item concurrency, replacement lineage, practice profiles, issue snapshots, and versioned PDF rendering from immutable data. Issued medical content and its snapshot are protected by service rules and PostgreSQL triggers. It does not recommend medication or implement drug data, interaction checking, signatures/images, stored PDF bytes, or notifications.

## Health model

- `/api/health/live` checks only that the process can answer.
- `/api/health/ready` checks PostgreSQL connectivity.

A database outage should make the instance unready without encouraging an orchestrator restart loop. Neither response exposes configuration or dependency details.

## Deployment

Local development runs Next.js on the host and PostgreSQL in Docker Compose. A responsible future production deployment uses a stateless Node application, private PostgreSQL connectivity, TLS at a trusted ingress, a secret manager, separate migration and runtime database roles, encrypted backups, and tested restore procedures.

No deployment automation, service-level objective, RPO, or RTO is promised in V1.
