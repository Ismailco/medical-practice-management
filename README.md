# Clinic Management

Clinic Management is an open-source foundation for a small medical practice-management application. The intended product will support administrative and clinical workflows for one clinic, one doctor, and secretaries with limited permissions.

## Development status

**Phase 1: Authentication and Authorization** is implemented. The application has a protected shell, database sessions, doctor bootstrap tooling, and doctor-managed secretary accounts. Patient management, scheduling, consultations, notes, follow-ups, prescriptions, and other medical workflows are not implemented.

> **Synthetic data only:** this repository, its fixtures, and any public demonstration must never contain real patient data or identifiable information copied from real people.

This project is not production-ready healthcare software. A real deployment requires an independent security review and all applicable legal and compliance reviews. The project does not claim automatic compliance with Moroccan Law 09-08, CNDP requirements, HIPAA, GDPR, or any other framework.

## Technology

- Next.js App Router and React
- Strict TypeScript
- PostgreSQL 18 for local development
- Drizzle ORM and migration tooling
- Zod environment validation
- Tailwind CSS
- Vitest
- pnpm

- Better Auth database sessions with explicit Argon2id password hashing

## Requirements

- Node.js 24 or newer
- pnpm 11 or newer
- Docker with Docker Compose

## Setup

```bash
pnpm install
cp .env.example .env
# Replace BETTER_AUTH_SECRET with: openssl rand -base64 32
docker compose up -d
pnpm db:migrate
pnpm auth:create-doctor
pnpm dev
```

Open <http://localhost:3000>. The checked-in environment values are local demonstration placeholders, not production credentials.

Health endpoints:

- `GET /api/health/live` confirms that the application process can respond.
- `GET /api/health/ready` confirms that the application can reach PostgreSQL.

Readiness intentionally depends on PostgreSQL; liveness does not. Orchestrators should restart a dead process but should remove an application with a temporarily unavailable database from service without creating a restart loop.

Stop the database with `docker compose down`. Add `--volumes` only when intentionally discarding all local development data.

## Environment configuration

| Variable                   | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `NODE_ENV`                 | `development`, `test`, or `production`                        |
| `APP_URL`                  | Exact canonical origin used for cookies and origin checks     |
| `DATABASE_URL`             | PostgreSQL connection URL used by the application and Drizzle |
| `BETTER_AUTH_SECRET`       | Random application secret; generate separately per deployment |
| `AUTH_ARGON2_MEMORY_KIB`   | Argon2id memory cost; defaults to 65,536 KiB                  |
| `AUTH_ARGON2_TIME_COST`    | Argon2id iteration cost; defaults to 3                        |
| `AUTH_ARGON2_PARALLELISM`  | Argon2id parallelism; defaults to 1                           |
| `AUTH_TRUSTED_PROXY_CIDRS` | Optional comma-separated trusted proxy CIDRs                  |
| `POSTGRES_DB`              | Local Compose database name                                   |
| `POSTGRES_USER`            | Local Compose database user                                   |
| `POSTGRES_PASSWORD`        | Local Compose database password                               |

Application environment variables are validated at server startup. Server configuration is kept outside the `NEXT_PUBLIC_` namespace so it cannot be intentionally bundled for browser use.

## Commands

```bash
pnpm dev             # development server
pnpm build           # production build
pnpm start           # run the production build
pnpm lint            # ESLint
pnpm typecheck       # strict TypeScript check
pnpm test            # test suite once
pnpm test:integration # PostgreSQL-backed authentication tests (isolated test DB)
pnpm test:watch      # test suite in watch mode
pnpm format          # format files
pnpm format:check    # verify formatting
pnpm db:generate     # generate a reviewed migration from schema changes
pnpm db:migrate      # apply checked-in migrations
pnpm db:check        # validate migration history
pnpm db:studio       # local Drizzle Studio
pnpm auth:create-doctor # interactively bootstrap the one doctor
pnpm auth:reset-doctor-password # operator recovery for the doctor account
```

Do not use runtime schema synchronization in production. Every schema change must be represented by a reviewed migration.

## Authentication and account recovery

There is no public registration, public password reset, email verification, or social login. Bootstrap the single doctor with `pnpm auth:create-doctor`; password entry is hidden on an interactive terminal. The doctor creates, disables, re-enables, and resets secretary credentials at `/settings/users`. Operator recovery for the doctor uses `pnpm auth:reset-doctor-password`. Passwords are set directly and are never emailed or displayed after submission.

The configured `APP_URL` must match the browser-facing origin. Production ingress must terminate HTTPS, prevent direct origin access, and replace—not append untrusted values to—the forwarded client-IP header. See the security architecture for session, CSRF, proxy, and throttle details.

## Project structure

```text
src/app/            Next.js routes and layouts
src/config/         validated server configuration
src/db/             database client and schema entrypoint
src/modules/auth/   authentication, sessions, throttling, capabilities
src/modules/users/  staff-account validation and services
src/lib/            narrowly scoped shared infrastructure
docs/architecture/  system, security, and data-model documentation
docs/adr/           architectural decision records
drizzle/            generated and reviewed database migrations
tests/              future integration and end-to-end test support
```

Only authentication/security modules exist today. Future business modules will be added when their phases are approved.

## Documentation

- [Architecture overview](docs/architecture/overview.md)
- [Security architecture](docs/architecture/security.md)
- [Planned data model](docs/architecture/data-model.md)
- [Backup and restore strategy](docs/architecture/backup-restore.md)
- [Architectural decisions](docs/adr/README.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Production warning

The Compose configuration and example credentials are for local development only. A responsible production design requires HTTPS, private database networking, independently managed secrets, least-privilege database roles, encrypted and restore-tested backups, monitoring, incident response, and a deployment-specific security and legal review. Retention and disaster-recovery objectives are operator decisions and are not automated in V1.

## License

Licensed under the [Apache License 2.0](LICENSE).
