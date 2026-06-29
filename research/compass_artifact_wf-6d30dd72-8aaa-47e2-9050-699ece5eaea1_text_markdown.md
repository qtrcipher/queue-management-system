# Building an Open-Source Queue Management System (QMS): Research & Reference Architecture

## TL;DR
- **There is a real, fillable gap.** The open-source QMS landscape is fragmented: the most capable project (bcgov/queue-management, 52★, Apache-2.0) is a government-specific Vue+Flask monolith in maintenance mode; the most modern (Turnly) has effectively vanished from GitHub; and the rest are dormant student projects or single-purpose waitlists. No actively-maintained, self-hostable, cross-platform project unifies **physical** (ticket/counter/TV display) AND **virtual** (QR/web remote) queueing with first-class Arabic/RTL support. That is the white space.
- **Recommended stack: a single Go binary (backend) embedding a React+TypeScript SPA, PostgreSQL, and Redis (optional), shipped as both a Docker Compose stack and a standalone executable.** Use WebSockets (with SSE fallback) for live updates, PostgreSQL row/advisory locks for race-free ticket assignment, and Little's Law plus a rolling service-time average for wait-time estimates. License under **AGPL-3.0** with a contributor licensing agreement to preserve an open-core/hosted-SaaS option.
- **Build an MVP first** (physical queue: kiosk check-in → ticket → counter dashboard → TV display → live updates; plus virtual QR join), then layer notifications (WhatsApp/SMS/email), analytics, multi-branch, and RBAC in later phases. Sustain it via hosted SaaS + paid support, not feature-gating the core.

## Key Findings

### 1. The existing open-source landscape is thin and mostly stale
Verified GitHub metadata (June 2026):

| Project | Stars | Forks | Status | Stack | License |
|---|---|---|---|---|---|
| **bcgov/queue-management** | 52 | 58 | Not archived; maintenance mode (last release Dec 19 2024) | Vue + Python/Flask, Postgres, Redis, KeyCloak, OpenShift | Apache-2.0 |
| **SimplQ/simplQ-frontend** | 193 | 156 | Dormant since ~2021 | React PWA (JS/SCSS) | GPL-3.0 |
| SimplQ/simplQ-backend | 18 | 29 | Dormant since ~2021 | Java/Spring Boot, Postgres | GPL-3.0 |
| **opengovsg/queuesg** | 21 | 15 | **Archived Dec 23 2024** | Next.js/React + **Trello as backend**, Twilio/Zapier SMS | Custom |
| **bcgov/sbc-qsystem** | 15 | 23 | **Archived Oct 17 2018** | Java (fork of Apertum QSystem) | GPL-3.0 |
| qms-opensource/queuemanagementsystem (IDS InfoTech) | 16 | 11 | Dormant (~17 commits, since 2019) | Laravel/PHP + MySQL | None (all-rights-reserved) |
| calvincchan/line-me-up | 5 | 2 | Small/early (late 2024) | TypeScript + Supabase/Refine | None specified |
| 2color/auroqueue | low | low | Old (Node 4 era) | Node.js + Socket.IO (Raspberry Pi) | open |
| Turnly | n/a | n/a | **Effectively withdrawn from GitHub**; only empty `.github` repo remains (May 2025); product site turnly.app still markets a proprietary product | Microservices/TS (historical) | was open, now n/a |

**What this means:**
- **bcgov/queue-management** is the single best learning reference: it has real production pedigree (Service BC government offices), supports multiple locations, reception-based AND direct-counter offices, channel tracking (in-person/phone), KeyCloak SSO, and analytics via Snowplow/Looker. But it is heavyweight, OpenShift/KeyCloak-coupled, government-specific, and not "small-business self-host" friendly. Fork-worthy for data model and flow ideas, not as a base.
- **SimplQ** is the cleanest example of a pure **virtual** queue (React PWA + Spring Boot) but is abandoned and GPL.
- **queuesg** demonstrates a clever no-backend "pop-up queue" pattern (Trello as admin) — interesting but not a serious self-host base, and now archived.
- **Turnly** had the most ambitious modern vision (web-widget remote queues, multi-location, WhatsApp/SMS/push/calls, Docker Compose + Kubernetes deploy targets, microservices) — its disappearance is the clearest signal that there is an **unfilled niche for a maintained, simpler, monolithic alternative.**

**Gaps a new project can fill:** (1) actively maintained; (2) genuinely easy self-hosting for non-technical SMBs (single binary or one-command Compose); (3) unified physical + virtual queueing in one codebase; (4) first-class bilingual Arabic/English with RTL; (5) permissive-enough licensing + a clean plugin model for notifications; (6) modern real-time UX out of the box.

### 2. Core feature set
A complete QMS spans five surfaces — **customer**, **kiosk**, **staff/agent**, **display/TV**, and **admin** — plus a notification layer. Benchmarking against commercial leaders (Qminder, Waitwhile, Qmatic, QLess, WaitWell):

**Must-have (MVP):**
- Ticket/token generation (per-service prefixes, e.g., A-001, B-014; daily reset)
- Multi-service & multi-counter support; assign counter/desk to agent
- Kiosk/check-in interface (touch screen: pick service → print/show ticket)
- Staff dashboard: Call Next, Recall, Start/Complete/No-show, transfer to another service/counter
- Customer-facing TV display: "now serving" numbers per counter, with chime/visual alert
- Virtual/remote join via **QR code or web link — no app install** (browser PWA); live position + ETA on the customer's phone
- Real-time sync across all surfaces
- Basic admin config (services, counters, branches, users)

**Phase 2+:**
- Notifications: SMS, email, web push, WhatsApp ("you're next"/"your turn")
- Queue prioritization (VIP, appointments, elderly/disabled, SLA tiers)
- Estimated wait time (see §4)
- Appointment booking integrated with walk-ins
- Analytics & reporting: wait time, service time, no-show rate, peak hours, per-agent throughput, per-branch comparison; CSV/BI export
- Multi-branch/multi-location with aggregated dashboards
- Role-based access control (super-admin, branch manager, agent, display-only)
- Custom intake fields, customer feedback/CSAT, two-way messaging
- Digital signage extras (promos/media on the TV between calls)

### 3. Architecture & recommended tech stack

**Backend — recommend Go** (alternatives ranked):
- **Go (recommended):** compiles to a single static binary with **no runtime dependency** (no Node/Python/JVM to install on the customer's machine), trivially cross-compiles for Windows + Linux + ARM (Raspberry Pi), excellent concurrency for WebSocket fan-out, and the `//go:embed` directive (Go 1.16+) lets you **bake the entire React build into the binary** — ship one file. This is the strongest answer to "non-technical SMB self-hosting on Windows or Linux."
- **Node.js/NestJS:** fastest to build, huge ecosystem, Socket.IO + Redis adapter is battle-tested for real-time; downside is the Node runtime dependency and heavier footprint. Strong second choice given the developer's full-stack JS background.
- **Python/FastAPI:** great DX and AI-library access (relevant to the developer's AI experience for wait-time ML later), but runtime dependency and GIL concurrency caveats.
- **.NET:** excellent (SignalR is a superb real-time layer, single-file publish works); good if the developer prefers C#.
- **PHP/Laravel:** proven (most existing OSS QMS use it) but weakest real-time story and least aligned with single-binary distribution.

**Frontend — recommend React + TypeScript** (with Vite): largest ecosystem, best hiring/contributor pool, mature RTL/i18n via **react-i18next** (~7.1M weekly npm downloads for react-i18next itself; its parent `i18next` package draws ~14.6M weekly — namespaces, ICU plural support). ICU matters for Arabic: per the Unicode CLDR plural rules, **Arabic uses all six plural categories — zero, one, two, few, many, other** (e.g., `n%100=3..10` → few, `n%100=11..99` → many), so a library with full ICU MessageFormat support (react-i18next + i18next-icu, or next-intl) is required. Svelte is a strong lightweight alternative (smaller bundles, easy RTL via a derived `dir` store) and Vue is what bcgov uses; React wins on ecosystem and embeddability. Use a component lib with solid RTL support and set `dir="rtl"` + logical CSS properties.

**Database — recommend PostgreSQL** primary, with **SQLite** as a zero-config single-site option:
- PostgreSQL: robust concurrency (row-level `SELECT … FOR UPDATE`, advisory locks, sequences), JSON, great analytics. Default for multi-counter/multi-branch.
- SQLite: perfect for a single small business on one device (LAN-only), embedded in the binary, zero admin. Offer both via a config switch.
- MySQL/MariaDB: supported alternative; no strong reason to prefer over Postgres.

**Real-time — recommend WebSockets as primary, SSE as fallback:**
- Live "now serving" updates, dashboard state, and customer position all need server→client push. WebSockets give low-latency bidirectional channels; for the many **display-only / customer-position** screens that are purely one-way, **Server-Sent Events** are simpler, auto-reconnect, and work through plain HTTP/proxies — a pragmatic fallback/option.
- For horizontal scale, put a **Redis Pub/Sub backplane** behind the socket layer so any server instance can broadcast to all connected clients (and use sticky sessions or stateless+Redis). Single-binary deployments can skip Redis entirely (in-process pub/sub) until they scale out.

**Reference architecture (single-binary "monolith-first"):**
```
[Kiosk] [Staff PC] [TV Display] [Customer phone via QR]
       \        |         |         /
        \       |         |        /
        ──────  HTTPS + WebSocket/SSE ──────
                     │
        ┌────────────┴─────────────┐
        │  Go binary (single file) │
        │  • REST/JSON API         │
        │  • WebSocket hub         │
        │  • embedded React SPA    │
        │  • notification workers  │
        └────────────┬─────────────┘
              ┌───────┴────────┐
        PostgreSQL/SQLite   Redis (optional, for scale)
              │
     Notification providers (pluggable): Twilio/WhatsApp BSP, SMTP, web push
```

### 4. Real-time, concurrency & scalability
- **Race-free ticket assignment & "Call Next":** the classic bug is two agents calling the same next ticket, or two kiosks issuing the same number. Solve with PostgreSQL **`SELECT … FOR UPDATE`** on the next-waiting row (pessimistic, simplest and correct), **`pg_advisory_xact_lock`** scoped per-queue/branch for hot paths, or **optimistic locking** (a `version` column + `WHERE version = n`, retry on 0 rows affected) when contention is low. For token numbering, use a per-service Postgres **sequence** or a locked counter row. Start with correctness (locks), optimize only if contention appears.
- **State sync:** keep the queue state authoritative in the DB; broadcast deltas (ticket called, completed, joined) over the socket hub rather than full snapshots; clients reconcile. Send periodic heartbeats and use exponential-backoff reconnection on the client.
- **Wait-time estimation:** apply **Little's Law (L = λW, so W = L/λ)** — expected wait ≈ (number ahead in line) ÷ (effective service rate). Compute the service rate from a **rolling average of recent service times** per service/counter, multiplied by the number of open counters. This is simple, distribution-independent, and "good enough"; later, the developer's AI background can add an ML model on historical data (time-of-day, day-of-week, service mix), as commercial tools (WaitWell's "Waillo AI", Qless forecasts) advertise.
- **Scale:** a single instance comfortably handles thousands of concurrent socket connections (budget ~10–50KB memory per connection); for multi-branch SaaS, scale out behind a load balancer with the Redis backplane. Watch file-descriptor (`ulimit`) and load-balancer connection limits.

### 5. Deployment & distribution for non-technical SMBs
Offer **three tiers of difficulty** so the same project serves a barbershop and a bank:
1. **Single binary (easiest):** download `qms.exe` (Windows) or `qms` (Linux), double-click/run, it serves the web UI on `localhost:PORT` using embedded SQLite. Ideal for one-location, LAN-only use; runs fully offline on the business's own device. Package as an MSI/installer for Windows and `.deb`/`.rpm` or a `systemd` unit for Linux; consider a tray app.
2. **Docker Compose (recommended default):** `docker compose up` brings up the app + PostgreSQL (+ Redis). This is the de-facto standard for self-hosted business software; pair with a reverse proxy (Caddy/Traefik/Nginx Proxy Manager) for automatic HTTPS. Most Docker deployments take under 30 minutes for someone who can edit a `.env` file.
3. **Hosted/cloud (for those who don't want to host):** one-click templates (Coolify, CapRover, Dokploy, Render) and your own optional managed SaaS.
- **LAN vs cloud:** physical-queue-only sites can run entirely on the LAN (TV, kiosk, staff PCs on the same network) with no internet — important for reliability and for **data residency** (see GCC note). Virtual/QR queues need inbound internet or a tunnel so customers' phones can reach the server.
- **System requirements:** keep it light — target ~1 vCPU / 512MB–1GB RAM for a small site (single binary + SQLite); 2GB+ with Postgres/Redis for multi-counter/branch. Ship sensible defaults, automated DB migrations on startup, and a guided first-run setup wizard.

### 6. OSS project best practices
- **License — recommend AGPL-3.0** for the core. For a self-hostable business tool you want to monetize via hosting, AGPL keeps it OSI-approved open source while requiring any competitor who offers it as a network service to publish their modifications (the "anti–cloud-giant shield" used by Grafana, Nextcloud, MongoDB-era). Pair with a **CLA/copyright ownership** so you retain the right to dual-license or build a proprietary hosted/enterprise edition later. (Choose **Apache-2.0** instead if maximizing adoption/contributors and embedding is the priority and you don't fear SaaS clones; avoid permissive MIT if you ever want license leverage. Note AGPL is blacklisted by some large enterprises — a real adoption trade-off.)
- **Repository presentation (README that earns stars):** logo + one-line value prop ("Open-source queue management for physical & virtual queues — self-hosted, bilingual"), a **GIF/screenshot demo** of the TV display and kiosk, a few essential **badges** (build, license, release, Docker pulls), a **<30-second quick start** (`docker compose up`), a features table, a "why" section, links to docs, and a contribution invite. Use Shields.io; don't over-badge.
- **Docs & community:** `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue/PR templates, a roadmap, and a dedicated docs site (deployment, configuration, notification provider setup). Provide a live demo and seed data. Enable GitHub Discussions; consider a Discord. Label "good first issue" tasks.
- **Quality signals:** CI (build/test/lint), CodeQL/security scanning, semantic versioning + changelog, signed releases, prebuilt binaries and Docker images on every release.

### 7. Monetization / sustainability
Realistic models for a self-hosted business tool (often combined):
- **Hosted SaaS** — the strongest fit: many SMBs will happily pay to avoid running infrastructure. Keep core open, sell convenience/uptime.
- **Support & services** — setup, customization, SLAs, integration work; natural in the GCC where systems integrators (and local partners) bundle install + support.
- **Open-core** — keep the core fully usable; gate **enterprise** features (SSO/SAML, advanced analytics, multi-tenant management, white-label) behind a paid tier. Be transparent to avoid community backlash.
- **Sponsorships/donations** — GitHub Sponsors as a supplement, not a primary income.
- Common guidance: don't relicense after the community forms; start monetization once you have real adoption (rule-of-thumb signals cited in the ecosystem: ~1,000+ stars or 100+ companies using it).

### GCC / bilingual considerations (where relevant)
- **Arabic/English with RTL is a genuine differentiator** in GCC markets and largely absent from existing OSS QMS. Build it in from day one: i18n via react-i18next with ICU (Arabic's six plural forms), `dir="rtl"`, logical CSS properties, mirrored icons, and Arabic-Indic numeral option on tickets/displays. Bilingual kiosk and TV display are table stakes for banks, clinics, and ministries in Qatar/GCC.
- **Notifications:** WhatsApp is dominant in the region — prioritize a **WhatsApp Business** channel (via a BSP/Twilio) alongside SMS and email. WhatsApp business-initiated messages require pre-approved templates and explicit opt-in. Per Meta (2026), **utility templates delivered within an open 24-hour customer service window are free** (the window opens when the customer first messages the business), so a "your turn" utility message triggered after a customer joins a virtual queue can often be sent at no per-message cost. Build a **pluggable notification interface** so businesses pick their own provider/credentials.
- **WhatsApp pricing is shifting and GCC-specific:** effective **July 1, 2025 Meta moved WhatsApp from conversation-based pricing to per-message pricing** (each delivered template billed individually). Further, effective **July 1, 2026 Qatar moves out of the regional "Rest Of" rate band to standalone, market-specific rates with higher utility-message rates** — directly relevant to a Qatar/GCC deployment. Validate current rates and template categories before committing to a notification design.
- **Data residency / compliance:** Qatar's **PDPPL (Law No. 13 of 2016)** restricts cross-border transfer of personal data and mandates security safeguards; self-hosting/LAN operation is a strong selling point because it keeps customer data on the business's own premises/in-country. Support full local/offline operation and clear data-retention/erasure controls to help customers meet PDPPL (and analogous Saudi/UAE/Bahrain laws).

## Recommendations

**Tech stack (decision):** Go backend (single binary, `//go:embed` the SPA) + React/TypeScript (Vite, react-i18next) + PostgreSQL (SQLite for single-site) + WebSockets (SSE fallback) + optional Redis backplane. Ship as both a standalone binary (with Windows installer + Linux package) and a Docker Compose stack. License **AGPL-3.0 + CLA**.

**Phased roadmap:**
- **Phase 0 — Foundations (weeks):** data model (branches, services, counters, tickets, users, queues), auth + RBAC skeleton, config wizard, i18n/RTL scaffolding, Docker + single-binary build pipeline.
- **Phase 1 — Physical MVP:** kiosk check-in → ticket generation (race-safe) → staff dashboard (Call Next/Recall/Complete/No-show/Transfer) → TV display with chime → real-time sync. SQLite default.
- **Phase 2 — Virtual queue:** QR/web-link remote join (PWA, no install), live position + Little's-Law ETA, return-to-queue UX, basic SMS/email notify.
- **Phase 3 — Engagement:** WhatsApp + web push, appointment booking + walk-in blending, prioritization/VIP, customer feedback/CSAT.
- **Phase 4 — Scale & insight:** multi-branch aggregated dashboards, full analytics/reporting + BI/CSV export, Redis backplane, audit logs, ML wait-time model.
- **Phase 5 — Ecosystem/monetize:** plugin API for notifications/integrations, white-label/theming, enterprise SSO, launch hosted SaaS + support offering.

**Benchmarks that change the plan:**
- If single-binary distribution proves painful for the React embed/build, fall back to Docker-Compose-first and treat the binary as a "lite" SKU.
- If contributor interest is high but enterprise adoption is blocked by AGPL, consider relicensing decision **before** the community grows (not after).
- If real-time at one site never exceeds a few hundred connections, **skip Redis** entirely — don't add operational complexity you don't need.
- Re-evaluate WebSockets vs SSE per surface: if customer-position and TV screens are purely one-way at your scale, SSE alone may simplify ops materially.

**Concrete starting references:** study **bcgov/queue-management** (data model, multi-location flows, channel tracking — Apache-2.0, forkable); **SimplQ** (virtual-queue UX patterns); **queuesg** (pop-up/no-backend idea); Go `//go:embed`-React templates (e.g., Darep/golang-react-app-single-binary, cbrake/goreact) for the single-binary build; Socket.IO Redis adapter / NestJS+Redis patterns for the real-time backplane; Nielsen Norman Group's virtual-queue UX best practices for the customer waiting experience.

## Caveats
- **GitHub metrics are point-in-time (June 2026)** and move; verify before relying on them. Turnly's exact historical stars/forks could not be re-verified because its canonical repo is no longer publicly accessible — treat "Turnly is discontinued on GitHub" as well-supported but its old numbers as unconfirmed.
- **Commercial feature lists and "AI wait-time" claims** from vendors (Qminder, Waitwhile, WaitWell, Qless, Qmatic) are marketing; treat advertised capabilities and pricing as indicative, not audited. As an illustration of magnitude: third-party listing SoftwareWorld shows Qminder at Starter $389/mo, Business $789/mo, Premium $1,049/mo (annual billing), while Qminder's own pricing page states "Starting at $9,468/year" and WaitWell's 2026 comparison cites $429/$869/$1,149/mo with appointment scheduling as a paid add-on — i.e., quoted tiers vary by source and the top tier exceeds $1,000/month.
- **WhatsApp Business pricing and template rules change frequently** (Meta moved to per-message pricing July 1, 2025; Qatar gets standalone market rates July 1, 2026); validate current template categories, opt-in requirements, free-window rules, and per-message costs before committing to a notification design.
- **Legal/compliance specifics (PDPPL, cross-border transfer, DPO duties, fines)** are summarized from secondary sources; confirm current obligations with a qualified advisor before making compliance claims to customers. Licensing choice (AGPL vs Apache vs dual) has long-term business consequences — worth a brief consult with an OSS-savvy lawyer.
- This report recommends an opinionated stack; the developer's existing strengths (full-stack JS, Swift, AI) make **Node.js/NestJS** a fully defensible alternative to Go if single-binary distribution is deprioritized in favor of development speed.