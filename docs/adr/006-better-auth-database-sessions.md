# ADR-006: Better Auth with database sessions

## Status

Accepted

## Context

Staff authentication needs password credentials, revocable sessions, secure cookies, and maintained CSRF protections without a custom authentication framework. Public registration and recovery are out of scope.

## Decision

Use Better Auth with its Drizzle PostgreSQL adapter and opaque database-backed sessions. Expose application-owned login/logout routes that delegate to Better Auth, but do not mount its public catch-all API. Use normalized email as the identifier, disable registration and verification, and override password hashing with Argon2id. Sessions expire after eight hours and cookie caching is disabled.

## Consequences

Credentials and session mechanics follow a maintained library while the available surface stays narrow. The application must track Better Auth schema/API changes during upgrades. Authentication requires PostgreSQL availability, and operators must configure the canonical HTTPS origin and proxy trust correctly.
