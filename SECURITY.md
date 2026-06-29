# Security Policy

## Supported Versions

Security fixes target the latest released version. This project is currently pre-1.0, so breaking changes may be made to resolve security issues.

## Reporting a Vulnerability

Do not open a public issue for suspected vulnerabilities. Use GitHub private vulnerability reporting for this repository when it is enabled. If it is not available, contact the repository owner through their GitHub profile and request a private disclosure channel.

Include reproduction steps, affected versions or commits, expected impact, and any relevant logs with secrets removed. You should receive an initial response within 7 days.

## Security Defaults

- Do not commit `.env` files or provider credentials.
- Rotate `SESSION_SECRET` before production use.
- Use HTTPS in production.
- Keep `WEB_ORIGIN` set to the exact public HTTPS web origin.
- Keep the web CSP `connect-src` narrowed to the deployed API origin.
- Keep SMTP/SMS credentials scoped to the deployment.
- Do not expose PostgreSQL or Redis ports publicly.
