# Backup and restore strategy

This document describes the beta operator procedure. The application does not encrypt or retain backup
files itself; infrastructure operators must provide encrypted storage, access control, retention, and
secure deletion.

## Backup approach

- Prefer a managed PostgreSQL service with encrypted automated backups and point-in-time recovery.
- Supplement that service with periodic logical backups using PostgreSQL's custom archive format when portability is required.
- Run backups with a dedicated, least-privilege database identity. Never place database credentials in commands, logs, repository files, or backup names.
- Encrypt backups before they leave the trusted database environment, store encryption keys separately, and restrict restore access.
- Store copies in a separate failure domain from the primary database. Define retention only after legal and operational review.
- Never commit a database backup to this repository. Public examples may contain synthetic data only.

## Restore verification

A backup is not considered usable until it has been restored successfully. On a deployment-defined schedule:

1. Restore into an isolated PostgreSQL instance with no public application traffic.
2. Apply the application version and migration set corresponding to the backup.
3. Verify migration history, expected table constraints, representative row counts, and application readiness.
4. Record the test result and securely dispose of the restored copy when verification is complete.

Restores must not use production data in developer machines or public test environments. Access to restored healthcare data requires the same controls as the primary database.

## Local verification commands

Use an isolated disposable database and never put a password in shell history or repository files:

```bash
DATABASE_URL=postgresql://operator@localhost:5432/clinic_restore_test \
  scripts/db-backup.sh /tmp/clinic-synthetic.dump
DATABASE_URL=postgresql://operator@localhost:5432/clinic_restore_test \
  scripts/db-restore.sh /tmp/clinic-synthetic.dump
```

The Phase 8 restore check creates a synthetic source database, applies all migrations, backs it up,
restores into a separate database, and verifies readiness plus representative relationship counts.
Never use `clinic`, `postgres`, `staging`, or production-looking names for a destructive restore.

## Deployment decisions still required

A real operator must define recovery-point and recovery-time objectives, backup frequency, geographic placement, retention, key custody, access approval, restore ownership, and breach-response procedures. Those choices require a deployment-specific security and legal/compliance review.
