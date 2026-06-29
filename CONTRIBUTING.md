# Contributing

Thanks for helping improve QMS. Keep changes focused and include tests for queue logic, API behavior, and user-facing workflows when practical.

## Local Setup

```bash
cp .env.example .env
pnpm install
pnpm db:generate
docker compose up -d postgres redis mailpit
pnpm db:push
pnpm db:seed
pnpm dev
```

## Pull Requests

- Use concise, imperative commit messages, for example `Add staff call flow`.
- Include a summary, test results, linked issues, and screenshots for UI changes.
- Sign off commits with DCO when possible: `git commit -s`.
- Do not commit secrets, local databases, generated build output, or `.env` files.

