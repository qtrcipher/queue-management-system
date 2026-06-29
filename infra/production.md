# Production Deployment

Use this guide to turn the Docker-based MVP into a small production deployment. The default `docker-compose.yml` is convenient for development, so review each item before exposing QMS publicly.

## Deployment Model

Run the app behind HTTPS with separate public origins for the web app and API, for example:

- Web: `https://qms.example.com`
- API: `https://api.qms.example.com`

Build the web image with the public API URL:

```bash
docker compose build --build-arg VITE_API_BASE=https://api.qms.example.com web
docker compose build api
```

Set the API CORS and ticket-link origin to the public web URL:

```env
NODE_ENV=production
WEB_ORIGIN=https://qms.example.com
TRUST_PROXY=true
QMS_AUTO_DB_SYNC=false
```

The API sets secure cookies when `NODE_ENV=production`; serve it only over HTTPS in that mode.

When `NODE_ENV=production`, the API refuses to start unless `SESSION_SECRET` is strong and `WEB_ORIGIN` is HTTPS.

## Required Environment

Create a production `.env` on the server and do not commit it. At minimum, set:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://qms:REPLACE_ME@postgres:5432/qms?schema=public
REDIS_URL=redis://redis:6379
SESSION_SECRET=replace-with-at-least-32-random-bytes
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_FROM=QMS <no-reply@example.com>
SMS_PROVIDER=webhook
SMS_WEBHOOK_URL=https://sms-gateway.example.com/qms
SMS_WEBHOOK_SECRET=replace-with-provider-secret
WHATSAPP_PROVIDER=disabled
WHATSAPP_WEBHOOK_URL=
WHATSAPP_WEBHOOK_SECRET=
WEB_ORIGIN=https://qms.example.com
TRUST_PROXY=true
```

Generate `SESSION_SECRET` with a password manager or:

```bash
openssl rand -hex 32
```

Keep the same `SESSION_SECRET` across restarts unless you intentionally want to sign out all users.

## Compose Hardening

Before deploying, create a production-specific Compose file or override with these changes:

- Replace the default Postgres password and align `DATABASE_URL`.
- Remove public host ports for `postgres` and `redis`; only the API should reach them.
- Remove `mailpit` and configure a real SMTP provider.
- Configure `SMS_PROVIDER` and `WHATSAPP_PROVIDER` as `disabled`, `mock`, or `webhook`.
- Set `NODE_ENV=production` and the correct `WEB_ORIGIN` for `api`.
- Set `TRUST_PROXY=true` only when the API is behind a trusted reverse proxy that controls `X-Forwarded-For`.
- Build `web` with the production `VITE_API_BASE`.
- Set the web container `QMS_API_CONNECT_SRC` to the exact API origins, for example `'self' https://api.qms.example.com wss://api.qms.example.com`.
- Keep `QMS_AUTO_DB_SYNC=false` in production and run schema/seed commands intentionally during deployment.
- Put a reverse proxy such as Caddy, Nginx, Traefik, or a managed load balancer in front of `web` and `api`.

Development and demo Compose files opt into automatic `pnpm db:push` and `pnpm db:seed` with `QMS_AUTO_DB_SYNC=true`. Production deployments should leave this disabled and run data changes as explicit release steps.

## Security Controls

The application ships with these baseline protections:

- HttpOnly session cookies with `Secure` enabled in production.
- Production startup validation for `SESSION_SECRET` and `WEB_ORIGIN`.
- Origin/Referer checks on unsafe API methods.
- Login throttling after repeated failed attempts from the same email and client address.
- API and web security headers for content sniffing, framing, referrer policy, feature policy, and static-web CSP.

Keep `WEB_ORIGIN` exact. A mismatch between the browser URL and API setting will block authenticated state-changing requests.

## SMS and WhatsApp Webhooks

Set `SMS_PROVIDER=webhook` or `WHATSAPP_PROVIDER=webhook` to forward ticket notifications to an external gateway. QMS sends a `POST` request with this JSON shape:

```json
{
  "channel": "sms",
  "to": "+15551234567",
  "text": "Your queue ticket is A-001",
  "ticket": {
    "code": "A-001",
    "serviceName": "General Service",
    "ticketUrl": "https://qms.example.com/ticket/ticket-id"
  }
}
```

If `SMS_WEBHOOK_SECRET` or `WHATSAPP_WEBHOOK_SECRET` is set, QMS sends it as a bearer token in the `Authorization` header. Keep webhook endpoints private and validate that token at the gateway.

## Reverse Proxy

Route public HTTPS traffic to the containers:

```text
qms.example.com      -> web:80
api.qms.example.com  -> api:3000
```

Forward standard proxy headers and enable WebSocket upgrades for API traffic so real-time queue updates keep working.

## First Launch Checklist

1. Copy `.env.example` to a server-only `.env` and replace every development value.
2. Build the web image with the public API URL.
3. Start dependencies and run database setup intentionally: `docker compose up -d postgres redis`, then `docker compose run --rm api pnpm db:push` and `docker compose run --rm api pnpm db:seed`.
4. Start the full stack: `docker compose up -d`.
5. Check health: `docker compose ps` and `curl -fsS https://api.qms.example.com/health`.
6. Sign in with the seeded owner account, then immediately change or replace the default `admin@example.com` credentials.
7. Configure real branch, service, counter, user, and notification settings.
8. Run a test ticket through `/kiosk`, `/staff`, `/display`, and `/ticket/:id`.
9. Confirm login, ticket creation, and admin saves work through the public HTTPS origin.
10. Create and validate a database backup using [Backup and Restore](backup-restore.md).

## Operations

- Monitor container health, API logs, disk space, Postgres storage, and SMTP delivery.
- Schedule daily PostgreSQL backups and test restore regularly.
- Keep `.env`, database dumps, and SMTP credentials outside Git.
- Upgrade by backing up first, pulling the target commit, rebuilding images, and checking `/health` before reopening traffic.
