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
- Sign off commits with the Developer Certificate of Origin: `git commit -s`.
- Do not commit secrets, local databases, generated build output, or `.env` files.

## Developer Certificate of Origin

By signing off a commit, you certify that you wrote the contribution, have the right to submit it, and agree that it can be distributed under this repository's license. Each commit should include:

```text
Signed-off-by: Your Name <you@example.com>
```

Use `git commit -s` to add it automatically.

## Project Direction

QMS is intended to remain a fully usable open-source queue management system. Hosted services, paid support, or commercial packaging may exist later, but the core self-hosted product should stay useful without proprietary dependencies.
