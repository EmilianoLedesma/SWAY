# Portfolio + job-postulation tracker — design

Personal project, unrelated to SWAY's academic scope, hosted on the same
public droplet (`146.190.136.236`) as SWAY for speed — reuses existing
nginx-portal, no new server, no new DNS/cert. Kept fully isolated from
SWAY's own docker-compose stacks so it carries zero risk to the graded
project.

## Purpose

- Static portfolio page (projects, about, contact form) at
  `https://proyecto-sway.site/portfolio/`.
- Private job-postulation tracker (kanban-style binnacle: postulado /
  entrevista / oferta / rechazado) at the same path, login-gated.
- Mobile-first UI now; Expo/APK export is explicitly out of scope for this
  design — future work if pursued.

## Architecture

```
nginx-portal (existing container, unmodified config for sway routes)
  ├─ /portal/, /, /api/...   → sway (unchanged)
  ├─ /portfolio/             → static files (new)
  └─ /portfolio-api/         → proxy_pass → sway_portfolio_api (new)

sway_portfolio_api (new container, FastAPI + SQLite)
  - POST /portfolio-api/contact        public
  - POST /portfolio-api/login          public, issues JWT
  - GET/POST/PUT/DELETE /portfolio-api/postulations   JWT-gated
```

New `docker-compose.portfolio.yml` on the public droplet, separate from
`docker-compose.public.yml`/`docker-compose.private.yml`. Independent
lifecycle (`docker compose -f docker-compose.portfolio.yml up -d`) —
never touched by SWAY deploy/restart commands.

## Components

- `portfolio/` — static `index.html` + CSS + JS. No build step. Includes
  the existing kanban board UI (adapted from the provided MVP HTML), a
  login screen, and a contact form.
- `portfolio_api/` — single small FastAPI app. SQLite file at
  `/data/portfolio.db` (docker volume, survives container recreation).
- Single user, no signup: credentials (`PORTFOLIO_USER`,
  `PORTFOLIO_PASSWORD_HASH`) in `.env` on the droplet, never committed.

## Data model

```sql
CREATE TABLE postulations (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  location TEXT,
  salary TEXT,
  schedule TEXT,
  date_applied TEXT,       -- ISO date
  source TEXT,
  requirements TEXT,       -- newline-joined, matches MVP textarea format
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'postulado',  -- postulado|entrevista|oferta|rechazado
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT,
  message TEXT,
  created_at TEXT
);
```

A one-time seed step loads the 8 postulations already present in the
provided MVP HTML (`bitacora (1).html`) into `postulations` on first run.

## Auth

Single user, password hashed with bcrypt, stored in `.env`.
`POST /portfolio-api/login` verifies credentials, returns a JWT
(24h expiry). All `postulations` endpoints require
`Authorization: Bearer <jwt>`. `contact` stays open (no auth — it's the
public-facing contact form).

## Error handling

- 422 on invalid request body (FastAPI validation, default behavior).
- 401 on missing/expired/invalid JWT on protected routes.
- 404 on unknown postulation `id`.
- Frontend surfaces errors inline near the relevant form/action — no
  silent failures, no generic alert() for anything beyond the existing
  MVP's client-side required-field check.

## Testing

One `test_api.py` covering:
- login: success with correct credentials, 401 on wrong password.
- postulations CRUD round-trip: create → read → update status → delete.
- auth enforcement: protected routes reject requests without a valid JWT.
- contact endpoint accepts a valid payload and persists it.

No fixture-heavy suite, no per-endpoint edge-case exhaustiveness — this
matches the project's scale (single user, low traffic).

## Explicitly out of scope

- Expo/React Native export.
- Multi-user support / signup flow.
- Storing data in SWAY's shared Postgres (would couple personal data to
  the graded project's schema and lifecycle — rejected during
  brainstorming for that reason).
