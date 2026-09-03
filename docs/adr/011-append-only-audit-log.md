# ADR-011: Append-only audit logging

## Status

Accepted

## Context

Authentication and staff-administration events are security relevant now. A temporary auth-only event store would create migration work and inconsistent future auditing.

## Decision

Introduce the minimal shared `audit_log` in Phase 1. Application code may insert allow-listed events but a PostgreSQL trigger rejects updates and deletes. Store actor, action, entity reference, timestamp, and narrow non-sensitive metadata; never copy credentials, tokens, cookies, request bodies, or clinical values.

## Consequences

Later modules can reuse one event model without migrating throwaway records. Database owners remain able to bypass application immutability, and operational retention/export/access policy still requires a production decision. Audit-log user interfaces are deferred.
