# Planned data model

## Phase 0 state

No application domain tables exist yet. Drizzle is configured with an intentionally empty schema so each owning implementation phase can introduce reviewed tables and migrations.

## Conventions

- PostgreSQL is authoritative.
- Application identifiers use PostgreSQL `uuid` values generated with cryptographically secure randomness.
- Business tables will carry `clinic_id` even though V1 operates one clinic.
- Instants use `timestamptz` and are stored as UTC.
- Birth dates, issue dates, and clinic-local due dates use `date`.
- Clinic timezone uses an IANA identifier such as `Africa/Casablanca`.
- Mutable records use explicit optimistic-concurrency versions where concurrent editing matters.
- Foreign-key deletion behavior is chosen per relationship.
- Soft deletion is not a default pattern.
- Clinical and historical records are retained unless an explicit reviewed operation permits otherwise.

## Planned entities by phase

| Area                       | Planned entities                                                              | Phase |
| -------------------------- | ----------------------------------------------------------------------------- | ----: |
| Clinic identity and access | Clinic, User, DoctorProfile, auth session/account tables, AuditLog foundation |     1 |
| Patient administration     | Patient                                                                       |     2 |
| Scheduling                 | Appointment                                                                   |     3 |
| Clinical records           | Consultation, ClinicalNote, ClinicalNoteRevision                              |     4 |
| Follow-up work             | FollowUp                                                                      |     5 |
| Prescribing                | Prescription, PrescriptionItem, DocumentCounter                               |     6 |

The initial Patient model will not contain a sex or gender field. It will be added only if a concrete clinical workflow justifies collecting it.

## Disclosure boundaries

Secretary-facing patient and appointment DTOs contain only administrative information. Consultation content, notes, diagnoses, prescription contents, and sensitive follow-up reasons are excluded at the repository/service boundary, not merely hidden in UI components.

## Historical integrity

Finalized consultation and prescription records will be protected through service rules and database constraints or triggers. Clinical note changes will use append-only revisions. Issued prescription PDFs will be regenerated from an immutable issue snapshot and versioned renderer; PDF binaries are not stored in V1.

## Retention

No automatic deletion or jurisdiction-specific retention schedule is planned for V1. Production retention, erasure, legal hold, backup expiration, and archival rules require deployment-specific legal and operational review.
