# ADR-001: Modular monolith

## Status

Accepted

## Context

One developer must be able to build and operate a focused single-clinic application. Distributed services would add operational and consistency costs without an independent scaling need.

## Decision

Build one Next.js application organized into explicit domain modules and backed by one PostgreSQL database. Modules interact through in-process services and database transactions, not internal network APIs.

## Consequences

Deployment, local setup, tracing, and transactions remain simple. Module boundaries must be maintained through code ownership because process isolation will not enforce them. A later service extraction requires a new ADR and demonstrated need.
