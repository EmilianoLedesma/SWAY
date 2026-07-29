# Reportes — Filtering & Personal/Global Split — Design

**Date:** 2026-07-29
**Scope:** `MockupsSwayMobile`'s Reportes tab (`ProfileScreen.js`) + backend `app/routers/estadisticas.py`, `app/routers/especies.py`, `app/data/database.py`. Web2's `DashboardView.jsx` is the visual reference this ports from, not modified by this work.

## Problem

The mobile Reportes tab (added earlier this session) shows every stat/chart for the entire catalog with zero filtering — a fixed snapshot, same for every colaborador, every time. It doesn't answer "what changed recently," "what does my own activity look like," or "how are vulnerable species trending" — it just dumps all metrics at once. The PDF button has the same problem: one fixed full-catalog report, unrelated to anything the user might want to isolate.

There's also a pre-existing structural gap (flagged in the prior session, "Pending #1"): avistamientos aren't linked to a colaborador by ID — `Avistamiento.id_usuario` points to the `Usuario` (tienda customer) table, and the mobile submit flow (`SightingsScreen.js`) currently free-types `nombre_usuario`/`email_usuario` into `POST /api/reportar-avistamiento` rather than sourcing them from the authenticated session. Business decision (confirmed with user): mobile is a companion app for already-verified colaboradores, so identity should always come from the session on mobile — matching how Web1's public-facing form (unauthenticated visitors) still needs manual name/email input, since it has no session to draw from. This spec's personal-avistamientos filtering depends on that fix landing first (see Dependencies).

## Design

### 1. Two sub-tabs inside Reportes: Personal | Global

Reuse the existing chip-tab pattern already used for the screen's main `TABS` array — a small horizontal chip switcher, not a new component.

- **Personal**: colaborador's own avistamientos + eventos asistidos + own stat cards. Filtered by date range only (quick-pick chips: 7 días / 30 días / Todo).
- **Global**: full catalog trend view — species/conservation-state charts (Donut, BarChart, HBar — already built this session in `DashboardCharts.js`), filterable by date range, `estado` de conservación, `habitat`, and `especie` (searchable picker).

Both share one `filtros` state object in `ProfileScreen`: `{ desde, hasta, estado, habitat, especieId }`. Switching sub-tabs clears whichever fields don't apply to that sub-tab (Personal never sets `estado`/`habitat`/`especieId`).

### 2. Personal scoping — session email match

Per the business-decision above: once `SightingsScreen.js` sources `nombre_usuario`/`email_usuario` from the logged-in colaborador's session instead of free text (the actual fix for Pending #1 — separate from this spec's filtering work, but a hard dependency for the Personal sub-tab to be meaningful), the mobile client can reliably filter `getAvistamientosAll()`'s response client-side by `avistamiento.email_usuario === session.email`.

**Known limitation:** this only guarantees accuracy for avistamientos submitted *after* the session-sourcing fix lands. Anything already in the DB (from Web1's public form, or from mobile before the fix) carries whatever free-text email was typed at submit time, and won't reliably match. Acceptable — flagged here rather than silently glossed over.

### 3. Backend — additive query params, one shared filter helper

Extend three existing endpoints with optional query params (all default to `None` = unfiltered, so today's behavior — and web2, which calls these same endpoints unfiltered — is unaffected):

| Endpoint | New params |
|---|---|
| `GET /api/avistamientos` | `fecha_desde`, `fecha_hasta` (ISO date strings), `estado`, `habitat`, `especie_id` |
| `GET /api/especies/estadisticas` | `fecha_desde`, `fecha_hasta`, `estado`, `habitat` (no `especie_id` — filtering species-aggregate stats by one species just yields count 1, not useful) |
| `GET /api/reportes/especies` | same full set as `/api/avistamientos` |

`estado` and `habitat` values match the exact strings stored in `EstadoConservacion.nombre` / `Habitat.nombre` (e.g. `"Extinción Crítica"`, `"En Peligro"`, `"Vulnerable"`) — the mobile chip options are built from `getEstadosConservacion()`/`getHabitats()` (already-existing client functions) rather than a hardcoded local list, so the UI can never send a value the backend doesn't recognize.

Filter-building logic lives as small helper functions in `app/data/database.py` (alongside the existing `get_db_connection`/`construir_nombre_completo` helpers — not a new module, this is a couple of query-clause builders, not enough surface to justify one):

- `build_especie_filters(query, estado=None, habitat=None)` — chains `.filter(...)` onto an `Especie` query (joins `EstadoConservacion` for `estado`, `EspecieHabitat`+`Habitat` for `habitat`).
- `build_avistamiento_filters(query, fecha_desde=None, fecha_hasta=None, especie_id=None)` — chains onto an `Avistamiento` query.

All three endpoints call these instead of building ad hoc filter logic inline, so screen data and PDF data can never drift apart — same query-building code produces both.

### 4. PDF respects active filters

`downloadReportePDF(filtros)` (mobile client, already exists from this session, gets a parameter added) serializes `filtros` into the query string against `GET /api/reportes/especies`. The reportlab document runs the same filtered query as the JSON endpoints and adds a one-line filter summary near the top of the PDF (e.g. "Filtros: Vulnerables · Arrecife · 01/07/2026–29/07/2026") so a downloaded file is self-describing even opened later, out of context. Filename stays `reporte-especies-sway.pdf` — not worth encoding filter state into the filename when the in-PDF header line already covers it.

### 5. Mobile filter UI

- **Personal**: date-range quick-pick chips only (7 días / 30 días / Todo) — simpler than two `DateField` pickers for a single dimension, matches the agreed "just a date-range filter" scope.
- **Global**: chip row for `estado` (Crítica/Peligro/Vulnerable/Todas) and `habitat` (fetched via existing `getHabitats()`), plus the same date-range quick-picks, plus a simple filter-as-you-type especie picker (reusing the existing especies list from `getEspecies()` — no new autocomplete component/library).
- Re-fetch on any filter change: immediate for chip taps, ~400ms debounced for the especie text search.

## Out of Scope

- The actual SightingsScreen session-sourcing fix (Pending #1) — this spec's Personal tab depends on it but doesn't implement it. Should land first or alongside, as its own small change.
- Eventos tipo/modalidad catalog-ID fix (Pending #2) — unrelated to Reportes.
- Historical backfill/cleanup of pre-existing avistamientos with mismatched free-text emails.
- Any change to web2 — endpoints stay backward-compatible by construction (new params optional, default unfiltered).

## Testing (manual, no test framework in this repo)

1. Backend: call each of the 3 endpoints via `/docs` with zero params — confirm response shape is byte-for-byte identical to pre-change behavior (regression check for web2).
2. Backend: call each with one filter param at a time, then combinations — confirm result narrows as expected.
3. Mobile: toggle each Global filter (estado, habitat, especie, date range) — confirm charts and stat cards update; confirm empty-filter combos show existing "Sin datos"/"Sin avistamientos registrados" empty states rather than erroring.
4. Mobile: switch to Personal, confirm only session-email-matching avistamientos show, confirm date-range quick-picks narrow the list.
5. Mobile: apply a filter combo on Global, hit "Descargar PDF" — open the file, confirm the header filter-summary line matches what was selected and the listed especies match what was on screen.
6. Mobile: apply no filters, hit "Descargar PDF" — confirm full-catalog PDF matches today's existing (pre-filtering) output.
