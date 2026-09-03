# ADR-012: Timezone and date handling

## Status

Accepted

## Context

Appointments represent instants, while birth dates and follow-up due dates are calendar values. Morocco timezone rules can change and must not be represented as a fixed UTC offset.

## Decision

Store instants in PostgreSQL `timestamptz`, exchange them as ISO 8601 values, and display them using the clinic's IANA timezone. Store calendar-only values as `date`. `CLINIC_TIMEZONE` is required and validated at startup; the development example is `Africa/Casablanca`, not a hard-coded offset. Use `date-fns-tz` for local-time conversion and calculate each local day boundary separately so daylight-saving days need not contain 24 hours.

## Consequences

Daily agenda boundaries must be calculated in the clinic timezone and tested around offset transitions. Date-only values do not accidentally shift when viewed elsewhere. Timezone database updates become an operational dependency.
