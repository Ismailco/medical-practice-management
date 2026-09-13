# Contributing

Thank you for helping improve this open-source beta for small medical clinics.

## Scope

Please keep contributions focused on the existing practice-management application. Avoid unrelated platform features, new medical decision support, unsafe healthcare claims, and architectural changes without prior discussion.

## Privacy rule

**NEVER use real patient or clinical data.** Issues, screenshots, tests, fixtures, pull requests, logs, examples, and bug reports must use synthetic data only. Do not include identifiable information copied from real people.

## Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm auth:create-doctor
pnpm dev
```

For browser tests, use a separate environment and a dedicated PostgreSQL database ending in `_test`. Install the local browser once with `pnpm exec playwright install chromium`.

## Required checks

Run the current suite before submitting a change:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm db:check
pnpm security:scan
```

Integration and E2E tests use these safeguards:

- `NODE_ENV=test`
- `ALLOW_TEST_DATABASE_RESET=true`
- a dedicated database whose name ends in `_test`
- never point destructive tests at development, staging, or production

Use synthetic demo data only. Never commit `.env`, credentials, production artifacts, or database backups.

## Schema changes

Schema changes require a generated and reviewed migration, migration-chain verification, and an explanation of data and security implications. Do not use runtime schema synchronization in production.

## Authorization and security

Any authorization change requires allowed-path tests, denied-path tests, and role-isolation verification. Report vulnerabilities through the private process in `SECURITY.md`; never put security exploit details in a public issue.

## Large changes

Open an issue before starting a schema redesign, architecture change, new domain, change to authorization semantics, or dependency with broad architectural impact. Feature requests should not assume medical decision-support scope.
