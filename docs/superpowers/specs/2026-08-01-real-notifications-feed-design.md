# Real Notifications Feed — Design

**Date:** 2026-08-01
**Status:** Approved, implementing directly (small scope, no plan/subagent cycle needed)

## Problem

`NotificationsScreen.js` and the "Preferencias de notificaciones" toggles on `ProfileScreen.js` are both 100% decorative — 7 hardcoded mock notifications, `notifPrefs` local state never read anywhere. Confirmed via direct user questions this session.

## Decisions

- **Scope: in-app feed only (option A)**, not real push notifications (option B rejected — no device-token/backend-trigger infra exists, out of scope).
- **No backend changes, no persistence layer.** Computed live from data already fetched elsewhere in the app (same pattern as `useRecentActivity`), not stored in AsyncStorage or a new DB table.
- **Every real avistamiento counts as "verified."** No verification workflow exists in the backend (confirmed: no `verificado` column, `mapAvistamientoFromApi` always hardcodes `PENDING`). Matches the precedent already set for the "Guardián del océano" badge — explicit user instruction this session ("mark all avistamientos as verified").
- **"Upcoming events" is the global event list**, not just events the user organized — notifications about events you could attend, not just your own.
- **Keep all 7 static mock entries, unchanged, always shown** — explicit user instruction ("do not delete statics, leave to look abundant"). Real entries render above them, sorted by real date descending; statics keep their fixed relative-time labels below.
- **Caps**: badges uncapped (naturally small, bounded by the fixed badge list). Avistamientos capped to the last 10. Events capped to the next 5. Mirrors the cap already used on Actividad reciente (5).

## Architecture

New hook `src/hooks/useNotifications.js`, mirroring `useRecentActivity`'s shape:
- Fetches `getAvistamientosMine()` (own reports → "verified" entries) and `getEventos()` (global, filter `status === 'UPCOMING'`, via the same date comparison `EventsScreen.js`'s `mapEventoFromApi` already uses).
- Reads `useGamification().badges`, filters `unlocked`.
- Fetch runs once per screen mount (`useEffect(() => {...}, [])`, not `useFocusEffect`) — `NotificationsScreen` is a stack screen pushed from the bell icon (`hideBell` prop passed to its own `ScreenHeader`, confirming it's not a persistent tab), so it naturally remounts fresh each time it's opened. This also sidesteps needing to preserve local read/delete state across a live refetch — out of scope, matches the existing (already ephemeral, session-only) read/delete behavior for the static entries.
- Returns an array shaped like the existing notification objects (`id`, `type`, `icon`, `title`, `body`, `time`, `date` for sorting), IDs prefixed (`badge-...`, `avistamiento-...`, `evento-...`) to never collide with the static `'1'`–`'7'` IDs.
- Relative-time label (`hace 2 días`, etc.) reuses the same inline pattern already duplicated independently in `SightingsScreen.js`/`HomeScreen.js`/`ProfileScreen.js` — adding a 4th local copy in `NotificationsScreen.js` matches the existing codebase convention rather than introducing a shared utility as an unrelated refactor.

`NotificationsScreen.js`: `const liveNotifications = useNotifications();` then seed `useState` with `[...liveNotifications, ...notifications]` once on mount. `markRead`/`deleteNotif`/`markAllRead` work identically on the merged list — no special-casing needed between real and static entries.

## Error handling

If any source fetch fails (`success: false`), that source just contributes zero entries — doesn't block the others or the static list. Same defensive pattern as `useRecentActivity`.

## Testing

No automated mobile/screen-level tests exist in this repo (established pattern all session) — manual Expo Go verification only.

## Out of scope

- `notifPrefs` persistence/filtering — separate, undecided (flagged earlier this session, not part of this ask).
- Real push notifications (option B).
- Read/delete state persisting across screen remounts.
