# Repository Guidelines

## Project Structure & Module Organization

This repository is currently empty aside from this contributor guide. As implementation begins, keep the top-level layout predictable:

- `src/` for application source code.
- `tests/` for automated tests that mirror `src/` structure.
- `assets/` for images, fonts, fixtures, and other static files.
- `docs/` for design notes, architecture decisions, and operational runbooks.
- `scripts/` for repeatable local or CI helper commands.

Avoid placing generated build output or local IDE state in the repository. Add ignore rules before introducing build tools.

## Build, Test, and Development Commands

No build system is configured yet. When one is added, document the canonical commands here and prefer package-manager scripts or Make targets over ad hoc commands. Examples:

- `make build` or `npm run build`: compile or bundle the project.
- `make test` or `npm test`: run the full automated test suite.
- `make lint` or `npm run lint`: run static checks and formatting validation.
- `make dev` or `npm run dev`: start the local development server.

Keep commands deterministic and safe to run from a clean checkout.

## Coding Style & Naming Conventions

Follow the formatter and linter chosen for the project once tooling exists. Until then, use consistent indentation, descriptive names, and small modules with single responsibilities. Prefer lowercase, hyphenated directory names such as `user-flows/`, and match test filenames to the unit under test, for example `src/orders/service.ts` and `tests/orders/service.test.ts`.

## Testing Guidelines

Add tests alongside new functionality. Unit tests should cover business rules and edge cases; integration tests should cover module boundaries and external dependencies. Name tests after observable behavior, not implementation details. Any new test framework, coverage threshold, or fixture convention should be documented in this section when introduced.

## Commit & Pull Request Guidelines

There is no Git history in this directory yet, so no existing commit convention can be inferred. Use concise, imperative commit messages such as `Add order validation` or `Fix login error handling`. Pull requests should include a short summary, testing performed, linked issue or task references, and screenshots or screen recordings for user-facing changes.

## Agent-Specific Instructions

Before editing, inspect the current tree and preserve user changes. Do not overwrite `AGENTS.md` if it already exists. Keep future updates to this guide brief and specific to tooling that is actually present in the repository.
