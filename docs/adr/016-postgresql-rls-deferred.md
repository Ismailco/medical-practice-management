# ADR-016: PostgreSQL row-level security deferred

## Status

Accepted

## Context

PostgreSQL RLS can provide defense in depth, but a single pooled application identity requires reliable per-transaction request context. Incorrect policies or owner bypass can create false confidence.

## Decision

For V1, enforce clinic scope and role authorization in centralized server policies, purpose-specific repositories, DTOs, foreign keys, and tests. Do not enable RLS. Reconsider it for multiple tenants, multiple database identities, or a proven request-context design.

## Consequences

Authorization behavior remains explicit in application code and easier for one developer to debug. The database will not independently filter arbitrary authorized queries, so repository discipline, least-privilege grants, and IDOR tests are mandatory.
