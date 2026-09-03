# ADR-010: Clinical record revisions and finalization

## Status

Accepted

## Context

Clinical text must support corrections and concurrent editing without silently erasing history. A finalized visit must remain reproducible, while later clarification must still be possible. Appointment and consultation lifecycle state must not diverge.

## Decision

Store consultation clinical text as complete, immutable `clinical_note_revision` snapshots. Allocate revision numbers while holding the consultation row lock and require an optimistic consultation version. Finalization is terminal, requires a revision, and freezes the latest revision through a same-consultation composite foreign key.

Protect revisions, addenda, finalized consultations, and consultation identity with PostgreSQL triggers and constraints as well as service rules. Corrections after finalization are new immutable addenda. Starting an appointment-linked consultation and finalizing it change the linked appointment in the same transactions.

## Consequences

Clinical history is easy to reconstruct and stale saves cannot overwrite newer work. Snapshot storage uses more space than diffs, but its operational simplicity is appropriate for a small clinic. Database-owner maintenance that legitimately changes protected records must deliberately manage the triggers and is outside normal application operations. Finalized records cannot be reopened; mistakes require an addendum.
