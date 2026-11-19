# ZAMOVO — Telegram Lead Database

A Cloudflare Workers + D1 application for managing Telegram leads. The repository is intentionally flat: all deployment files live at the repository root.

## Current milestone

**0.1.0 — clean foundation**

- Cloudflare Worker with Static Assets.
- D1 schema and migration.
- Admin-token authentication.
- Health and readiness endpoints.
- Initial dashboard shell.
- No Telegram scraping, bulk messaging, or unsupported automation.

## Repository layout

```
.
├── migrations/0001_initial_schema.sql
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── src/
│   ├── db.js
│   ├── http.js
│   └── worker.js
├── .gitignore
├── CHANGELOG.md
├── package.json
├── README.md
└── wrangler.jsonc
```

## Cloudflare setup

See [DEPLOYMENT.md](./DEPLOYMENT.md). The repository root is the Worker root directory; do not set a nested root directory in Cloudflare Builds.

Required Worker secret:
- `ADMIN_TOKEN` — a long, random password used to sign in to the web interface.

D1 binding:
- Binding name: `DB`
- Database name: `zamovo-db`
- Migration directory: `migrations`

The D1 database ID must be added to `wrangler.jsonc` after creating the database. Do not commit API keys, passwords, Telegram sessions, or other secrets.

## Local checks

Node.js is only needed for development checks, not for normal use of the deployed web app.

```bash
npm test
```

## Product principles

- One canonical lead record per Telegram user ID.
- Segment membership is many-to-many.
- Lists are paginated on the server.
- Telegram collection and messaging must respect Telegram API rules, user privacy, and consent.
- No arbitrary audience scraping, anti-spam evasion, or unsolicited automated messaging.
- Features are delivered in milestones; an unfinished feature is never presented as operational.
