# Architecture overview

## Status and scope

The application is a modular monolith for one clinic, initially one doctor, and one or more secretaries. Phase 0 contains infrastructure only. Authentication starts in Phase 1; business domains are not implemented.

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

Future protected operations follow this order:

1. Authenticate a database-backed session.
2. Confirm the user is active and belongs to the clinic.
3. Validate external input.
4. Authorize a named capability and resource.
5. Run the domain service and database transaction.
6. Record a safe audit event where required.
7. Return a minimal DTO.

UI visibility is not an authorization control.

## Health model

- `/api/health/live` checks only that the process can answer.
- `/api/health/ready` checks PostgreSQL connectivity.

A database outage should make the instance unready without encouraging an orchestrator restart loop. Neither response exposes configuration or dependency details.

## Deployment

Local development runs Next.js on the host and PostgreSQL in Docker Compose. A responsible future production deployment uses a stateless Node application, private PostgreSQL connectivity, TLS at a trusted ingress, a secret manager, separate migration and runtime database roles, encrypted backups, and tested restore procedures.

No deployment automation, service-level objective, RPO, or RTO is promised in V1.
