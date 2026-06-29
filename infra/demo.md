# Public Demo Environment

Use this guide to publish a disposable public QMS demo on a small VPS. The demo stack is separate from local development and uses production-mode cookies, HTTPS, private database/Redis ports, and seeded demo data.

Do not use the demo stack for real customer operations. It is intended for public evaluation and should be reset regularly.

## Requirements

- A Linux host with Docker and the Docker Compose plugin.
- Two DNS records pointing to the host:
  - `qms.example.com`
  - `api.qms.example.com`
- Public ports `80` and `443` open for Caddy automatic HTTPS.

## Configure

```bash
cp .env.demo.example .env.demo
openssl rand -hex 32
```

Edit `.env.demo`:

- Set `SESSION_SECRET` to the generated value.
- Set `POSTGRES_PASSWORD` to a unique demo database password.
- Set `DEMO_WEB_HOST` and `WEB_ORIGIN` to the public web host.
- Set `DEMO_API_HOST` to the public API host.
- Set `ACME_EMAIL` for certificate notifications.

Keep `.env.demo` out of Git.

## Launch

```bash
docker compose --env-file .env.demo -f docker-compose.demo.yml up --build -d
docker compose --env-file .env.demo -f docker-compose.demo.yml ps
curl -fsS https://api.qms.example.com/health
```

Open `https://qms.example.com` and sign in with the seeded owner:

- Email: `admin@example.com`
- Password: `admin12345`

After launch, create a visible banner or repository note that the demo uses seeded data and may be reset.

## Reset Demo Data

Reset the public demo whenever the data becomes noisy:

```bash
docker compose --env-file .env.demo -f docker-compose.demo.yml down -v
docker compose --env-file .env.demo -f docker-compose.demo.yml up --build -d
```

The demo Compose file sets `QMS_AUTO_DB_SYNC=true`, so the API container reapplies the Prisma schema and seed data on startup.

## Operations

- Keep `postgres`, `redis`, and `mailpit` unexposed; only Caddy publishes ports.
- Rotate `SESSION_SECRET` during resets if public sessions should be invalidated.
- Pull and rebuild from `main` after CI is green.
- Check logs with `docker compose --env-file .env.demo -f docker-compose.demo.yml logs -f api web proxy`.
