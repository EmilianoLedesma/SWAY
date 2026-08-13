# Job tracker multi-user — design

Proof of concept: extends the existing single-user portfolio/job-tracker
subsystem (`portfolio_api`, deployed at `proyecto-sway.site/portfolio/`)
to support multiple accounts for a small informal group (Emiliano +
friends/classmates), with open self-registration. UI stays exactly as it
is today — this is a backend/data-model change plus a URL split, not a
redesign. Visual polish is explicitly deferred to a later pass.

## Purpose

- Split the single `/portfolio/` page (currently login + kanban board)
  into two things:
  - `/portfolio/` — reverts to a plain static stub (your projects/about
    page). Still unbuilt; deferred, same as before this multi-user work.
  - `/jobtracker/` — the login + kanban board, moved here unchanged,
    now backed by real multi-user accounts instead of one hardcoded user.
- Anyone can self-register an account at `/jobtracker/` and get their own
  private board — postulations are no longer global, they belong to the
  user who created them.

## Architecture

Same backend container (`portfolio_api`), same isolated docker-compose
stack, same `sway_edge_network`/nginx-portal/HAProxy routing pattern
already in production — only the data model and auth logic change, plus
one new nginx/HAProxy route for `/jobtracker/`.

```
nginx-portal
  ├─ /portfolio/     → static stub (unchanged path, new minimal content)
  ├─ /jobtracker/    → static files: login + kanban board (moved from /portfolio/)
  └─ /portfolio-api/ → proxy_pass → sway_portfolio_api (unchanged prefix)

sway_portfolio_api
  - POST /portfolio-api/register       public, rate-limited
  - POST /portfolio-api/login          public, checks users table
  - GET/POST/PUT/DELETE /portfolio-api/postulations   JWT-gated, scoped to caller's user_id
```

HAProxy's `path_portfolio` ACL (`path_beg /portfolio`) does NOT cover
`/jobtracker/` — a new `path_jobtracker` ACL routing to the same
`portal_back` is required (same gap class that bit the original deploy;
this plan accounts for it explicitly this time).

## Data model

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT
);

ALTER TABLE postulations ADD COLUMN user_id INTEGER REFERENCES users(id);
```

`contact_messages` stays deleted (removed in the prior branch's final
review — not reintroduced here).

## Migration (one-time, on deploy)

1. Create `users` table.
2. Insert one row for the existing account: username `emiliano`, reusing
   the already-generated bcrypt hash for `Emiliano1` (no password reset
   needed).
3. Add `user_id` column to `postulations`; backfill all 11 existing rows
   to the new `emiliano` user's id.
4. Drop `PORTFOLIO_USER`/`PORTFOLIO_PASSWORD_HASH` from `.env` and from
   `main.py`'s fail-fast check (added in the prior branch's final-review
   fix wave) — no longer applicable once auth is DB-backed.

## Auth

- `POST /portfolio-api/register`: takes `username`+`password`, rejects
  duplicate usernames (409), hashes password with the same bcrypt scheme
  already in use, inserts a `users` row. Rate-limited via `slowapi`
  (reuse the pattern from the main SWAY API's `requirements.txt`/usage,
  not currently a `portfolio_api` dependency — add it), e.g. 5
  registrations per hour per IP.
- `POST /portfolio-api/login`: looks up `username` in `users`, verifies
  password, issues a JWT whose `sub` is the user's numeric id (previously
  a fixed username string).
- `get_current_user` dependency: unchanged shape, now returns a payload
  keyed on user id instead of a hardcoded username.
- Every `postulations` query (list/create/update/delete) filters or
  scopes by `user_id` from the JWT — a user can only ever see or modify
  their own rows. Attempting to update/delete another user's postulation
  id returns 404 (not 403 — avoids confirming the id exists for someone
  else's board).

## Error handling

- 409 on duplicate username at registration.
- 429 on rate-limit trip (slowapi default behavior).
- 401 on bad login credentials or missing/invalid JWT (unchanged).
- 404 on unknown postulation id, INCLUDING postulations that exist but
  belong to a different user (cross-user access must look identical to
  nonexistent, not surface a 403 that would leak existence).
- 422 on invalid registration/login body (FastAPI/Pydantic default).

## Testing

Extend the existing `test_api.py`-style coverage:
- Registration: success, duplicate-username rejection, rate-limit trips
  after the configured threshold.
- Login: success against a DB-created user, failure on wrong password.
- Cross-user isolation (the one bug class that matters most here): user A
  creates a postulation, user B's `GET /postulations` does not include
  it; user B attempting `PUT`/`DELETE` on user A's postulation id gets
  404, not the row.
- Migration: existing `emiliano` account and its 11 postulations survive
  the migration step unchanged (can log in with the same password, sees
  the same 11 rows).

## Explicitly out of scope

- UI/visual changes — deferred, this is backend + routing only for now.
- Email verification, password reset, or any account-recovery flow.
- Admin tooling to list/delete/ban users.
- Building the actual `/portfolio/` content (still deferred from the
  original design, unrelated to this change).
