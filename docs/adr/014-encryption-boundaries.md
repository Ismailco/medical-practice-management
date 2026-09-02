# ADR-014: Encryption boundaries

## Status

Accepted

## Context

Health records are sensitive, but field encryption without robust external key management can create false assurance and unrecoverable data loss.

## Decision

Require TLS, encrypted storage, encrypted backups, restricted access, and managed secrets for future production. Defer application-level clinical-field encryption until a deployment threat model and KMS/HSM-backed envelope-key design are approved. Do not invent cryptography or store a static data key beside database credentials.

## Consequences

The application remains maintainable and recoverable in the demonstration phase. Database-authorized operators can still see plaintext fields, so production operators must assess that risk. Adding field encryption later will constrain search and require rotation and disaster-recovery procedures.
