# Infrastructure

The default development and small-install deployment target is Docker Compose.

```bash
docker compose up -d postgres redis mailpit
```

Production deployments should set a strong `SESSION_SECRET`, use managed backups for PostgreSQL, put the API behind HTTPS, and configure a real SMTP provider.

