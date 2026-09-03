# ADR-009: Appointment lifecycle and overlap policy

## Status

Accepted

## Context

Appointments require preserved operational history, role-specific transitions, concurrent editing protection, and support for intentional double-booking in a one-doctor clinic.

## Decision

Represent lifecycle state with a bounded PostgreSQL enum and one centralized transition table. `COMPLETED`, `CANCELLED`, and `NO_SHOW` are terminal. Only doctors may enter or complete the visit state. Rescheduling is allowed only while scheduled, and every mutation uses an expected version.

Treat overlaps between non-terminal operational appointments as warnings. The server calculates half-open interval intersections, returns a specific conflict, and recalculates after explicit confirmation. Do not use an exclusion constraint because authorized double-booking is valid. Preserve every appointment row; cancellation replaces deletion.

Reject patient archival while any appointment is non-terminal, even when its planned end is in the past. Historical terminal appointments retain their patient reference after archival.

## Consequences

The workflow remains strict and auditable without preventing real scheduling exceptions. Concurrent confirmed double-bookings can both succeed by design. Correctness depends on all mutations using the domain services and on clients handling overlap conflicts explicitly.
