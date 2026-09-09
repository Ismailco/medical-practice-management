# Contributing

Thank you for contributing.

## Before making a change

1. Read `AGENTS.md` and the relevant architecture decision records.
2. Keep the change within the approved implementation phase.
3. Open an issue before making a large architectural or schema change.
4. Use only synthetic data. Never commit real patient information or production artifacts.

## Development workflow

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm dev
```

Before submitting a change, run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm security:scan
```

Browser E2E uses `.env.test.example`, a running PostgreSQL database ending in `_test`,
`NODE_ENV=test`, and `ALLOW_TEST_DATABASE_RESET=true`. Never point it at a development or production
database. Install the local browser once with `pnpm exec playwright install chromium`. To create synthetic demo data, set `ALLOW_DEMO_SEED=true` on an isolated demo database and
run `pnpm db:seed:demo`; the command refuses production and non-isolated databases.

For backup verification, use `scripts/db-backup.sh` and `scripts/db-restore.sh` with a disposable
restore database. Backups can contain sensitive data in real deployments and must not be committed.

Schema changes require generated and reviewed migrations. Explain important business and security consequences in the pull request. New authorization behavior requires both allowed and denied-path tests.

Report vulnerabilities through the private process in `SECURITY.md`, not through a public issue.
