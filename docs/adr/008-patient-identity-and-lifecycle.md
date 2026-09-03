# ADR-008: Patient identity, concurrency, and archival

## Status

Accepted

## Context

Patient records need stable internal references, a desk-friendly identifier, safe concurrent editing, and lifecycle preservation for future historical records. They must remain manageable by one developer without a generic deletion or versioning framework.

## Decision

Use a UUID as database/API identity and allocate immutable display numbers from a PostgreSQL sequence in `P-000001` form. Accept sequence gaps. Use an integer optimistic-concurrency version on updates and lifecycle transitions. Preserve patients through explicit doctor-only archive/restore fields; do not expose hard deletion.

## Consequences

Concurrent creates cannot collide or reveal sequential database primary keys, while staff receive a readable number. Stale edits fail explicitly instead of overwriting. Sequence values can have harmless gaps after rollback. Archived patients retain stable references and require restoration before editing. Patient-number formatting changes would require a reviewed migration rather than an ordinary edit.
