# ADR-004: Drizzle ORM

## Status

Accepted

## Context

The project needs TypeScript-safe queries while retaining clear access to PostgreSQL constraints, indexes, transactions, and custom migration SQL.

## Decision

Use Drizzle ORM with Drizzle Kit. Generate migrations from the typed schema, review the resulting SQL, commit it, and apply it explicitly. Do not use runtime schema synchronization in production.

## Consequences

Database behavior remains visible and close to SQL. Complex integrity rules can use reviewed SQL without fighting an abstraction. Contributors must understand migrations and cannot assume inferred TypeScript types replace runtime validation.
