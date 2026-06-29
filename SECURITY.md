# Security Policy

## Supported Versions

Security fixes target the latest released version. This project is currently pre-1.0, so breaking changes may be made to resolve security issues.

## Reporting a Vulnerability

Do not open a public issue for suspected vulnerabilities. Email the maintainer with reproduction steps, affected versions, and impact. You should receive an initial response within 7 days.

## Security Defaults

- Do not commit `.env` files or provider credentials.
- Rotate `SESSION_SECRET` before production use.
- Use HTTPS in production.
- Keep SMTP/SMS credentials scoped to the deployment.

