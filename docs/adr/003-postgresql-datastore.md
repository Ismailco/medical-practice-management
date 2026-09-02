# ADR-003: PostgreSQL datastore

## Status

Accepted

## Context

Clinical and administrative records have relational integrity, lifecycle, audit, and transactional requirements.

## Decision

Use PostgreSQL as the authoritative datastore. Express critical relationships and invariants with foreign keys, unique/check constraints, transactions, and narrowly reviewed triggers where declarative constraints are insufficient.

## Consequences

The application gains strong consistency and mature backup tooling. Developers need PostgreSQL for meaningful integration tests. Production operators remain responsible for private networking, patching, encryption, backup, and restore.
