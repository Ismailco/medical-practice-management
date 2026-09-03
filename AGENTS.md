# Repository agent instructions

These rules apply to all work in this repository.

## Engineering

- Keep the architecture a modular monolith.
- Prefer simple code over speculative abstractions.
- Use React Server Components by default. Add Client Components only when browser interaction requires them.
- Validate all external input with Zod at the server boundary.
- Keep database access server-side.
- Enforce business authorization on the server for every protected read and mutation.
- Never trust an identifier merely because it came from the UI.
- Prefer database constraints for invariants the database can enforce.
- Use transactions when multiple writes form one business operation.
- Preserve strict TypeScript. Do not introduce `any`, unsafe casts, `@ts-ignore`, or disabled checks without an exceptional documented reason.

## Security and privacy

- Never log clinical data.
- Never log passwords, password hashes, session tokens, cookies, CSRF tokens, or secrets.
- Never commit credentials or production environment files.
- Never weaken authorization to make a test pass.
- Do not expose database rows directly to clients. Return purpose-specific DTOs.
- Pass only the minimum patient information required to browser components.
- Treat future clinical information as sensitive by default.
- THIS REPOSITORY MUST NEVER CONTAIN REAL PATIENT DATA. Seeds, tests, screenshots, and examples must be wholly synthetic and must not copy identifiable people.

## Database

- All schema changes require generated, reviewed, committed migrations.
- Do not use schema push or runtime auto-sync in production.
- No destructive schema modification without explicit review and a recovery plan.
- Make every foreign-key deletion action intentional.
- Do not add soft-delete columns mechanically; choose deletion behavior per resource.
- Finalized historical records must respect their approved immutability rules once implemented.

## Testing

- Add tests for new business rules.
- Authorization work requires denial tests as well as success tests.
- Fix implementation defects rather than weakening tests.
- Prioritize meaningful risk coverage over a numerical 100% coverage target.
- Database invariants require integration tests against PostgreSQL.

## Scope

- Implement only the explicitly approved phase. Do not prepare product features from later phases.
- Do not add Redis, Kafka, Kubernetes, Elasticsearch, GraphQL, microservices, or comparable infrastructure without an approved ADR.
- Authentication and administrative patient records are implemented. Appointment, consultation, note, follow-up, and prescription functionality belongs to later approved phases.
- Keep the Patient module administrative-only. Do not add generic notes, metadata, or clinical fields to patient records.
- Patient numbers are immutable; patient updates and lifecycle changes must preserve optimistic-concurrency checks.
- Do not expose public registration, email recovery, or Better Auth's complete catch-all route without a new approved requirement and security review.
- Create staff through application services: the operator CLI creates the single doctor and authorized doctors create secretaries. Never accept a role from secretary-creation input.
