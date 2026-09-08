# Data model

## Phase 7 state

The database contains authentication/security infrastructure, administrative patient and appointment records, doctor-only consultation history, doctor-only follow-up records, and doctor-only prescription records with immutable issue snapshots. No medication catalog, notification, attachment, or billing structures exist.

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
| Clinic configuration   | ClinicProfile, DoctorProfessionalProfile                               |     6 |
| Patient administration | Patient                                                                |     2 |
| Scheduling             | Appointment                                                            |     3 |
| Clinical records       | Consultation, ClinicalNoteRevision, ClinicalNoteAddendum               |     4 |
| Follow-up work         | FollowUp                                                               |     5 |
| Prescribing            | Prescription, PrescriptionItem, PrescriptionIssueSnapshot, Counter     |     6 |

The initial Patient model does not contain sex/gender, government identifiers, free-text notes, insurance, or clinical information.

## Patient administration

`patient.id` is the stable UUID/API identity. `patient_number` is generated from `patient_number_seq` as `P-` plus at least six digits. The sequence is concurrency-safe, gaps are accepted, and a database trigger prevents patient-number changes.

Names preserve Unicode spelling/casing after surrounding and repeated whitespace normalization. Birth date uses PostgreSQL `date`. Optional contact fields store blank input as `NULL`; email is lowercased for matching, while phone retains a display form and a conservative digits/leading-plus search form. Phone and email are deliberately non-unique.

`version` starts at one and increments atomically for administrative updates and lifecycle changes. Updates require the expected version. A stale mutation affects no row and becomes an application conflict.

Patient archiving is an explicit lifecycle rule, not a generic soft-delete framework. `archived_at` and `archived_by` are either both set or both null. Archived rows remain readable and retain their identifiers, but are excluded from default search and cannot be ordinarily edited. Only a doctor may archive or restore them. There is no application hard-delete operation.

Search uses parameterized PostgreSQL predicates over patient number, case-insensitive display names, normalized phone, and normalized email. Wildcard characters are escaped, pages contain at most 20 rows, and archived rows are excluded unless deliberately requested. Search terms are sent in an authenticated POST body rather than a URL so names and contact identifiers do not enter routine URL access logs. No extension or external search service is required at the expected scale.

Names remain modeled as required `first_name` and `last_name` fields for V1. This is a known international-name limitation and should be revisited only with a concrete workflow. Duplicate warnings, automated deduplication, and patient merging are deferred; names, phones, and emails are intentionally non-unique.

## Appointments

`appointment.id` is a UUID; a separate appointment number is unnecessary. `patient_id`, `created_by`, and optional `cancelled_by` use restrictive foreign keys so deleting related records cannot erase history. Start and end are `timestamptz` instants with a database constraint requiring end after start. Durations between 5 minutes and 8 hours are enforced at the application boundary. Administrative reason text is nullable and limited to 160 characters.

Status is the bounded PostgreSQL enum `SCHEDULED`, `ARRIVED`, `IN_CONSULTATION`, `COMPLETED`, `CANCELLED`, or `NO_SHOW`. Cancellation actor/time must exist exactly when status is `CANCELLED`. Completed, cancelled, and no-show records are terminal and retained. Starting a linked consultation atomically moves an arrived appointment to `IN_CONSULTATION`; finalizing that consultation atomically completes the appointment. Direct completion is rejected when a consultation is linked.

Schedule and lifecycle mutations require `version`; successful changes increment it atomically. Only scheduled appointments may be rescheduled. Overlap means `existing.start < candidate.end AND existing.end > candidate.start`, excluding completed, cancelled, and no-show records and allowing boundary-touching appointments. A conflict response is followed by explicit confirmation and server re-evaluation; overlaps are not a database uniqueness invariant.

New appointments require an active patient. Existing appointments remain readable after patient archival. A patient cannot be archived while any appointment remains `SCHEDULED`, `ARRIVED`, or `IN_CONSULTATION`, regardless of its planned time. Staff must explicitly resolve stale workflow state; only completed, cancelled, and no-show appointments permit archival.

## Consultations and clinical-note history

`consultation` records the stable patient, optional unique appointment, authoring doctor, start time, `IN_PROGRESS` or `FINALIZED` state, optimistic version, revision count, and finalized revision. Direct consultations have no appointment. Patient-row locking coordinates consultation start with archival; any `IN_PROGRESS` consultation blocks patient archival.

Clinical content is not stored mutably on `consultation`. Each `clinical_note_revision` is a complete plain-text snapshot with a per-consultation number. The consultation row lock and stored revision count allocate numbers safely, while a unique `(consultation_id, revision_number)` index protects the sequence. A stale expected consultation version creates no revision.

Finalization requires at least one revision and freezes the latest revision through `final_revision_id`. A composite foreign key guarantees that it belongs to the same consultation, and a trigger verifies its revision number matches the consultation revision count. State constraints require finalized timestamp and revision together. PostgreSQL triggers permit sequential revision inserts only while in progress and reject revision updates/deletes, consultation deletes, finalized consultation updates, and consultation identity changes.

The migration does not fabricate consultations for pre-existing `IN_CONSULTATION` development rows. Such a legacy appointment remains explicitly resolvable through the appointment lifecycle, but once a consultation is linked only consultation finalization may complete it.

`clinical_note_addendum` is available only after finalization. Addenda are non-empty bounded plain text and database triggers reject update/delete. If an addendum needs correction, another addendum must explain it.

## Disclosure boundaries

Patient and appointment administrative queries return explicit DTOs and never gain consultation or follow-up existence or content. Doctor-authorized clinical queries use separate summary and detail DTOs. Consultation summaries omit clinical snippets; detail DTOs contain clinical content only after capability enforcement. Follow-up DTOs exist in a separate doctor-only boundary and are never returned by administrative repositories.

## Follow-ups

`follow_up` stores an active patient, optional consultation, creator, PostgreSQL `date` due date, bounded plain-text reason, lifecycle metadata, timestamps, and an optimistic version. `PENDING` is the only mutable state and can transition once to `COMPLETED` or `CANCELLED`; terminal rows cannot reopen, change, or be deleted. Database checks require status-specific actor/time pairs, and a trigger protects identity, terminal immutability, deletion, and version increments.

Consultation-linked creation supports both in-progress and finalized consultations without mutating either. A composite foreign key from `(patient_id, consultation_id)` to the consultation ownership key makes cross-patient links invalid even outside application services. Direct creation locks the patient row; consultation-linked creation derives the patient before acquiring the same lock. Patient archival acquires that lock before checking pending follow-ups, making an archived patient with newly created pending work an impossible committed state.

Due-today, overdue, and upcoming classification compares PostgreSQL `date` values with the current calendar date derived in `CLINIC_TIMEZONE`; no UTC timestamp conversion is applied to a follow-up date. Application-created records accept today or a future date. The database deliberately permits older dates for controlled imports. Operational sections are ordered by due date and bounded to 50 records each.

## Prescriptions

`prescription` stores a patient, optional same-patient consultation, authoring doctor, `DRAFT`, `FINALIZED`, or `VOID` status, optional replacement lineage, issue metadata, and an optimistic version. Draft creation does not allocate a number. Draft items are physician-entered bounded plain text with unique zero-based positions and can be transactionally replaced by a versioned save. Issued items and parent medical identity are protected by PostgreSQL triggers.

`prescription_counter` is a singleton transactional counter. Finalization locks it, allocates the next `RX-000001`-style number, calculates the clinic-local `issue_date`, creates one `prescription_issue_snapshot`, and commits the issued state in one transaction. A deferred constraint trigger requires exactly one snapshot for every committed issued prescription. Snapshot rows are explicit typed columns and immutable, preserving patient, doctor, and clinic identity when live records later change.

`clinic_profile` and `doctor_professional_profile` are one-clinic/one-doctor versioned settings. DRAFT prescriptions block archival; FINALIZED and VOID prescriptions do not. Replacement drafts retain a same-patient `replaces_prescription_id` and may be issued only once per original through a partial unique index. Duplication copies physician-entered items into an independent draft without issue metadata or replacement lineage. PDF responses are regenerated in memory from the immutable issue snapshot and finalized items; no PDF bytes, print jobs, medication catalog, interaction, or recommendation structures exist.

## Historical integrity

Finalized consultations are protected through service rules, constraints, composite ownership, and triggers; clinical notes and addenda are append-only. Follow-ups preserve terminal history and expose no hard-delete operation. Finalized and void prescriptions preserve their issue snapshots and item history; only a new replacement can correct them. Phase 7 renders the snapshot through an explicit versioned renderer; PDF binaries are not stored in V1.

## Retention

No automatic deletion or jurisdiction-specific retention schedule is planned for V1. Production retention, erasure, legal hold, backup expiration, and archival rules require deployment-specific legal and operational review.
