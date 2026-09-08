# ADR-013: Follow-up lifecycle and clinic-local dates

## Status

Accepted for Phase 5.

## Context

Follow-ups contain doctor-only clinical workflow text but represent calendar-day obligations rather than appointment instants. Their optional consultation relationship must not permit a patient mismatch, and creation must not race patient archival.

## Decision

Store due dates as PostgreSQL `date` values and classify them against the current date in `CLINIC_TIMEZONE`. Application creation accepts today or a future date; the database permits older dates for controlled backfill. Use `PENDING`, `COMPLETED`, and `CANCELLED`, with only pending records editable or terminally transitionable. Terminal records cannot reopen or be deleted.

Use optimistic versions and status-specific actor/time metadata. Protect history with constraints and a trigger. Link consultations through a composite patient/consultation foreign key, derive the patient during linked creation, and coordinate creation and archival with the patient-row lock. A pending follow-up blocks archival; terminal follow-ups do not.

Follow-up reasons are bounded plain text in a doctor-only DTO boundary. Audit metadata excludes reasons and exact due dates. Notifications are a separate future domain.

## Consequences

Operational queries can use a status/due-date index without timezone conversion. Imported past-due work remains representable, while ordinary UI errors are prevented. Creating another follow-up is the only way to schedule new work after a terminal outcome.
