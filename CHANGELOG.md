# Changelog

All notable changes to this project are documented here.

## [0.1.0-beta.2] - 2026-09-13

### Added

- Moroccan prescription profile fields and the versioned bilingual prescription template with bundled Arabic fonts.
- A professional clinic workstation interface with responsive role-aware navigation across dashboard, patient, appointment, consultation, follow-up, prescription, practice-profile, and staff workflows.
- Focused PostgreSQL integration coverage and appointment-overlap keyboard-focus coverage.

### Improved

- Patient, daily agenda, consultation, follow-up, prescription, practice-profile, and staff-management workflows with clearer hierarchy, status presentation, responsive layouts, and human-readable validation.
- Confirmation dialogs, keyboard focus restoration, date presentation, and destructive-action feedback.
- Authenticated prescription PDF launching and historical prescription presentation.
- CI and integration-test organization, timezone fixture stability, migration validation, and security checks.

### Fixed

- Schema-compatible practice-profile saves.
- Appointment-overlap confirmation focus restoration to the originating submit action.

This is an open-source beta. Real deployments require independent security, legal/compliance,
infrastructure, and backup/retention review. See the [beta.2 release notes](docs/releases/0.1.0-beta.2.md).

## [0.1.0-beta.1] - 2026-09-09

### Added

- Database-backed authentication, doctor/secretary authorization, and staff administration.
- Administrative patient records and appointment scheduling.
- Doctor-only consultations, immutable clinical note revisions, and addenda.
- Doctor-managed follow-ups with due-date views and lifecycle controls.
- Physician-entered prescriptions with immutable issued history, duplication, replacement, and voiding.
- Server-generated A4 prescription PDFs from immutable issue snapshots.
- Release hardening: guarded test resets, Playwright workflows, synthetic demo seed, and backup/restore scripts.

This is an open-source beta. Real deployments require independent security, legal/compliance,
infrastructure, and backup/retention review. See the [beta.1 release notes](docs/releases/0.1.0-beta.md).
