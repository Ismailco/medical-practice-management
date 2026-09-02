# ADR-005: UUID identifiers and clinic scoping

## Status

Accepted

## Context

Identifiers appear in URLs and audit references. V1 has one clinic, but records need an explicit ownership boundary and should not require later identifier replacement.

## Decision

Use cryptographically random UUID primary keys. Include `clinic_id` on business records and scope repository queries by clinic. UUID opacity is never considered authorization.

## Consequences

URLs do not expose simple row counts and future data import is easier. UUID indexes are larger than integer indexes, which is negligible at expected scale. Repeated clinic scoping and cross-clinic constraints are required to prevent IDOR defects.
