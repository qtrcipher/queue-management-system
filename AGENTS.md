# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript/pnpm monorepo for an open-source queue management system.

- `apps/api/`: NestJS API, Prisma schema, seed data, auth, queues, analytics, and notifications.
- `apps/web/`: React + Vite single-page app for kiosk, staff, display, admin, and ticket status flows.
- `packages/domain/`: shared queue types and state helpers.
- `packages/ui/`: shared UI primitives.
- `infra/`: deployment, demo, backup, restore, and operations notes.
- `research/`: product research references; do not treat these as runtime assets.

## Build, Test, and Development Commands

Run commands from the repository root:

- `pnpm install`: install workspace dependencies.
- `pnpm db:generate`: generate Prisma client for the API.
- `docker compose up -d postgres redis mailpit`: start local dependencies.
- `pnpm db:push && pnpm db:seed`: apply the local schema and seed demo data.
- `pnpm dev`: run API and web dev servers.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`: required checks before PRs.
- `pnpm test:e2e:docker`: rebuild the Docker stack and run Playwright smoke tests.
- `pnpm audit --prod --audit-level moderate`: check production dependency advisories.

## Coding Style & Naming Conventions

Use strict TypeScript and the existing ESM style. Keep imports explicit, prefer small service/controller methods, and follow existing two-space JSON formatting. React components use `PascalCase`; helpers and hooks use `camelCase`; files use descriptive lowercase names such as `queue.service.ts` or `bug_report.yml`.

## Testing Guidelines

Unit tests use Vitest and live beside the code as `*.test.ts`. Add focused tests for business rules, security boundaries, public API behavior, and regressions. End-to-end browser coverage uses Playwright via `pnpm test:e2e` or the Docker-backed `pnpm test:e2e:docker`.

## Commit & Pull Request Guidelines

Git history uses short imperative messages such as `Add public demo environment`. Keep commits scoped and signed off for DCO compliance: `git commit -s -m "Fix ticket privacy"`. Pull requests should include a summary, linked issue when available, screenshots or recordings for UI changes, and the checks run.

## Security & Configuration Tips

Never commit `.env` files, credentials, database dumps, or generated secrets. Rotate `SESSION_SECRET` before production use, keep `WEB_ORIGIN` exact, and leave `QMS_AUTO_DB_SYNC=false` in production unless intentionally running a demo-style reset.
