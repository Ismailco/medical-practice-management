# Changelog

All notable changes to this project are documented here.

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
infrastructure, and backup/retention review. See the [release notes](docs/releases/0.1.0-beta.md).
