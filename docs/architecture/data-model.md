# Data model

## Phase 2 state

The database contains authentication/security infrastructure and one administrative `patient` domain table. No clinical tables or fields exist.

The Better Auth tables own identities, password credentials, verification primitives, opaque database sessions, and its persistent rate limiter. Application services own staff policy, the failed-login pair throttle, and audit records. A partial unique index permits exactly one `DOCTOR`; the UI and API can create only `SECRETARY` users.

Sessions and accounts cascade when their user is removed. Audit actor references use `SET NULL` to preserve history, although user deletion is not an exposed V1 operation. Audit rows reject update and delete through a trigger. Login identifiers are unique case-insensitively and constrained to their normalized lowercase form.

## Conventions

- PostgreSQL is authoritative.
- Application identifiers use PostgreSQL `uuid` values generated with cryptographically secure randomness.
- One application/database deployment is the V1 clinic boundary. Multi-clinic scoping is deferred under ADR-005.
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

Clinic and doctor-profile tables remain deferred. The initial Patient model does not contain sex/gender, government identifiers, free-text notes, insurance, or clinical information.

## Patient administration

`patient.id` is the stable UUID/API identity. `patient_number` is generated from `patient_number_seq` as `P-` plus at least six digits. The sequence is concurrency-safe, gaps are accepted, and a database trigger prevents patient-number changes.

Names preserve Unicode spelling/casing after surrounding and repeated whitespace normalization. Birth date uses PostgreSQL `date`. Optional contact fields store blank input as `NULL`; email is lowercased for matching, while phone retains a display form and a conservative digits/leading-plus search form. Phone and email are deliberately non-unique.

`version` starts at one and increments atomically for administrative updates and lifecycle changes. Updates require the expected version. A stale mutation affects no row and becomes an application conflict.

Patient archiving is an explicit lifecycle rule, not a generic soft-delete framework. `archived_at` and `archived_by` are either both set or both null. Archived rows remain readable and retain their identifiers, but are excluded from default search and cannot be ordinarily edited. Only a doctor may archive or restore them. There is no application hard-delete operation.

Search uses parameterized PostgreSQL predicates over patient number, case-insensitive display names, normalized phone, and normalized email. Wildcard characters are escaped, pages contain at most 20 rows, and archived rows are excluded unless deliberately requested. Search terms are sent in an authenticated POST body rather than a URL so names and contact identifiers do not enter routine URL access logs. No extension or external search service is required at the expected scale.

Names remain modeled as required `first_name` and `last_name` fields for V1. This is a known international-name limitation and should be revisited only with a concrete workflow. Duplicate warnings, automated deduplication, and patient merging are deferred; names, phones, and emails are intentionally non-unique.

## Disclosure boundaries

Patient queries return explicit administrative DTOs. Internal search-normalization fields and archive actor IDs are not returned. Future consultation content, notes, diagnoses, prescription contents, and sensitive follow-up reasons must remain in separate module/query boundaries.

## Historical integrity

Finalized consultation and prescription records will be protected through service rules and database constraints or triggers. Clinical note changes will use append-only revisions. Issued prescription PDFs will be regenerated from an immutable issue snapshot and versioned renderer; PDF binaries are not stored in V1.

## Retention

No automatic deletion or jurisdiction-specific retention schedule is planned for V1. Production retention, erasure, legal hold, backup expiration, and archival rules require deployment-specific legal and operational review.
