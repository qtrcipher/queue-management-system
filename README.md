# QMS

Open-source queue management for physical and virtual queues. QMS is built for self-hosted branches that need kiosk check-in, staff counter workflows, public displays, QR/web joining, and Arabic/English support.

## Status

This repository is an early public MVP scaffold. It includes a working TypeScript monorepo, NestJS API, React/Vite web app, Prisma schema, Docker Compose services, seed data, and project governance files.

## Quick Start

```bash
cp .env.example .env
pnpm install
pnpm db:generate
docker compose up -d postgres redis mailpit
pnpm db:push
pnpm db:seed
pnpm dev
```

- Web app: http://localhost:5173
- API health: http://localhost:3000/health
- Mailpit: http://localhost:8025

Seed admin:

- Email: `admin@example.com`
- Password: `admin12345`

## Features

- Multi-branch, multi-service, multi-counter queue model
- Kiosk ticket creation and QR/web join flow
- Staff actions: call next, recall, start, complete, no-show, transfer
- Public display state and customer ticket tracking
- WebSocket queue updates
- Arabic/English UI with RTL/LTR direction switching
- SMTP email provider and mock SMS provider
- Audit and ticket event history foundation

## Repository Layout

```text
apps/api      NestJS API, Prisma schema, seed data
apps/web      React + Vite single-page app
packages/domain  Shared queue types and state helpers
packages/ui       Shared UI primitives
infra         Deployment and operations notes
research      Product research references
```

## License

Apache-2.0. See [LICENSE](LICENSE).

