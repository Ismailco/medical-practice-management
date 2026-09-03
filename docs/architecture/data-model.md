# Planned data model

## Phase 1 state

The database contains only authentication and security infrastructure. `auth_user`, `auth_session`, `auth_account`, `auth_verification`, and `auth_rate_limit` follow Better Auth's required schema. The application adds role/active fields to `auth_user`, plus `login_throttle` and `audit_log`.

The Better Auth tables own identities, password credentials, verification primitives, opaque database sessions, and its persistent rate limiter. Application services own staff policy, the failed-login pair throttle, and audit records. A partial unique index permits exactly one `DOCTOR`; the UI and API can create only `SECRETARY` users.

Sessions and accounts cascade when their user is removed. Audit actor references use `SET NULL` to preserve history, although user deletion is not an exposed V1 operation. Audit rows reject update and delete through a trigger. Login identifiers are unique case-insensitively and constrained to their normalized lowercase form.

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

| Area                   | Planned entities                                                       | Phase |
| ---------------------- | ---------------------------------------------------------------------- | ----: |
| Identity and access    | User, auth session/account tables, login throttle, AuditLog foundation |     1 |
| Clinic configuration   | Clinic, DoctorProfile                                                  | Later |
| Patient administration | Patient                                                                |     2 |
| Scheduling             | Appointment                                                            |     3 |
| Clinical records       | Consultation, ClinicalNote, ClinicalNoteRevision                       |     4 |
| Follow-up work         | FollowUp                                                               |     5 |
| Prescribing            | Prescription, PrescriptionItem, DocumentCounter                        |     6 |

Clinic and doctor-profile tables were deliberately deferred: authentication does not require them, and Phase 1 must not introduce a premature clinic domain. Future business tables still follow ADR-005 clinic scoping. The initial Patient model will not contain a sex or gender field.

## Disclosure boundaries

Secretary-facing patient and appointment DTOs contain only administrative information. Consultation content, notes, diagnoses, prescription contents, and sensitive follow-up reasons are excluded at the repository/service boundary, not merely hidden in UI components.

## Historical integrity

Finalized consultation and prescription records will be protected through service rules and database constraints or triggers. Clinical note changes will use append-only revisions. Issued prescription PDFs will be regenerated from an immutable issue snapshot and versioned renderer; PDF binaries are not stored in V1.

## Retention

No automatic deletion or jurisdiction-specific retention schedule is planned for V1. Production retention, erasure, legal hold, backup expiration, and archival rules require deployment-specific legal and operational review.
