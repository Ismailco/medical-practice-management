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
```

Schema changes require generated and reviewed migrations. Explain important business and security consequences in the pull request. New authorization behavior requires both allowed and denied-path tests.

Report vulnerabilities through the private process in `SECURITY.md`, not through a public issue.
