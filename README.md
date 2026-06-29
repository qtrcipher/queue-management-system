# QMS

Open-source queue management for physical and virtual queues. QMS is built for self-hosted branches that need kiosk check-in, staff counter workflows, public displays, QR/web joining, and Arabic/English support.

## Status

This repository is an early public MVP scaffold. It includes a working TypeScript monorepo, NestJS API, React/Vite web app, Prisma schema, Docker Compose services, seed data, and project governance files.

## Development Quick Start

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

## Full Docker Quick Start

```bash
cp .env.example .env
docker compose up --build
```

- Web app: http://localhost:8080
- API health: http://localhost:3000/health
- Mailpit: http://localhost:8025

The API container applies the Prisma schema and loads seed data on startup for the current MVP. Use `docker compose ps` to confirm `api`, `web`, `postgres`, and `redis` are healthy or running before testing browser flows. Replace development secrets in `.env` before any production deployment.

Useful web routes:

- `/kiosk`: touch-first ticket creation
- `/staff`: staff queue controls
- `/display`: public waiting-room display
- `/admin`: branch, service, and counter setup
- `/join/main`: customer QR join flow for the seeded branch
- `/ticket/:id`: customer ticket status, position, and ETA
- `/analytics/summary`: protected operational analytics API
- `/analytics/tickets.csv`: protected ticket CSV export

Seed admin:

- Email: `admin@example.com`
- Password: `admin12345`

## Features

- Multi-branch, multi-service, multi-counter queue model
- Kiosk ticket creation and QR/web join flow
- QR ticket tracking with queue position and estimated wait time
- Protected staff actions: call next, recall, start, complete, no-show, requeue, cancel, transfer
- Role-based access control for owners, admins, branch managers, agents, and display users
- Admin creation and editing for services, counters, and user roles
- Basic analytics for issued tickets, completion/no-show rates, wait time, service time, and CSV export
- Public display state and customer ticket tracking
- Built-in email/password session auth with httpOnly cookies
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

## Community

QMS is maintained as an open-source project under Apache-2.0. Contributions use DCO signoff instead of a CLA. See [CONTRIBUTING.md](CONTRIBUTING.md), [GOVERNANCE.md](GOVERNANCE.md), and [ROADMAP.md](ROADMAP.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
