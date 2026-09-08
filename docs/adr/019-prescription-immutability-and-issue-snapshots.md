# ADR-019: Prescription numbering, immutability, and issue snapshots

## Status

Accepted for Phase 6.

## Decision

Prescriptions are doctor-only documentation records with `DRAFT`, `FINALIZED`, and `VOID` lifecycle states. Drafts are editable through a single transactional, optimistic-concurrency save that replaces their ordered item collection. Finalization is explicit and terminal: it locks the draft and patient, requires at least one item and configured professional profiles, allocates a number from the singleton PostgreSQL `prescription_counter`, calculates the clinic-local issue date, writes one typed issue snapshot, and records a safe audit event in one transaction.

Issued numbers use the human-readable `RX-000001` format. Counter allocation is transactional and may leave gaps only when a transaction has already committed a number; numbers are never reused. `MAX(number)+1` is not used.

PostgreSQL state constraints and triggers reject impossible issue metadata, arbitrary updates to issued prescriptions, issued-item insert/update/delete, snapshot update/delete, and issued hard deletion. A deferred constraint trigger requires one snapshot for every committed `FINALIZED` or `VOID` prescription, allowing the finalization transaction to update the parent and insert the snapshot in sequence.

Corrections create a new replacement draft linked to the unchanged original. A composite same-patient invariant and issued-only target trigger prevent cross-patient lineage, self-reference, and cycles; a partial unique index permits at most one directly issued replacement. Duplication creates an independent draft with copied physician-entered items but no snapshot, issue metadata, or replacement lineage.

## Consequences

Historical rendering can use the stored patient, doctor, clinic, issue-date, and template-version values even after live profiles or patient administration change. Phase 7 may consume these immutable fields and items for printing/PDF generation. This phase deliberately provides no medication recommendations, drug catalog, interaction checking, signatures, or jurisdiction-specific legal claims.
