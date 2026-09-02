# ADR-018: Deployment model

## Status

Accepted

## Context

The repository must be simple to run locally and leave room for a responsible future production deployment without claiming production readiness.

## Decision

Run Next.js locally and PostgreSQL 18 in Docker Compose for development. The future production shape is a stateless Node application behind HTTPS with private PostgreSQL, platform-managed secrets, separate migration/runtime identities, encrypted backups, and tested restoration. Do not add deployment automation in Phase 0.

## Consequences

Contributor setup is small and portable. Compose credentials are demonstration placeholders only. Production hosting, compliance, RPO/RTO, scaling, and retention remain operator decisions requiring independent review.
