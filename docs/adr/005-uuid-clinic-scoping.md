# ADR-005: UUID identifiers and single-clinic instance boundary

## Status

Accepted

## Context

Identifiers appear in URLs and audit references. V1 is explicitly a single-clinic installation, and clinic configuration is not yet a domain model. Adding a synthetic `clinic_id` without a real tenant-selection or ownership model would imply protections that do not exist.

## Decision

Use cryptographically random UUID primary keys. For V1, one deployed application and database represent one clinic. Do not add `clinic_id` until a concrete multi-clinic or ownership requirement is approved through a new ADR. UUID opacity is never considered authorization; every operation still requires server-side authentication, capability checks, and resource-state rules.

## Consequences

URLs do not expose simple row counts and future data import is easier. Deployment isolation is the clinic boundary, so combining clinics in one V1 database is unsupported. A future multi-clinic change will require explicit ownership columns, constraints, authorization, migrations, and IDOR tests rather than merely adding nullable scope fields.
