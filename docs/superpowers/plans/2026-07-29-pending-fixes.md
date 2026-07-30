# Pending Fixes (ORCID mask, password logout, actividad reciente) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three independently-diagnosed mobile bugs from `progress.md`'s pendientes list: ORCID field has no input mask, password change doesn't force re-login despite promising it, and Home's "Actividad reciente" is hardcoded mock data instead of the collaborator's real avistamientos.

**Architecture:** Each task is a small, self-contained change to `MockupsSwayMobile`. Task 3 (fix broken URL in `getAvistamientosMine`) is a prerequisite for Task 4 (wire it into HomeScreen) — do Task 3 first.

**Tech Stack:** React Native (Expo), plain JS. No Jest configured — this repo's existing unit-test convention is a plain `node assert`-based script (see `src/utils/collaboratorValidation.test.js`), run directly with `node <file>`.

## Global Constraints

- Match existing code style exactly (no formatting/refactor drive-bys).
- No new dependencies.
- Backend at `app/routers/colaboradores.py:443-476` (`GET /api/colaboradores/avistamientos`) already scopes results to the logged-in collaborator by email — do not add client-side filtering by user.
- The events table has no attendance/RSVP linkage in the backend — do NOT attempt to wire "eventos asistidos" into actividad reciente; only avistamientos have real per-user data available.

---

### Task 1: ORCID auto-format mask in registration form

**Files:**
- Modify: `MockupsSwayMobile/src/utils/collaboratorValidation.js` (add exported pure function)
- Modify: `MockupsSwayMobile/src/screens/LoginScreen.js:471-478` (wire mask into `onChangeText`)
- Test: `MockupsSwayMobile/src/utils/collaboratorValidation.test.js` (append assertions, same convention as existing file)

**Interfaces:**
- Produces: `formatOrcidInput(raw: string): string` — takes the current raw input value (any string a user could type/paste) and returns it re-formatted as `0000-0000-0000-0000` (or the X-suffix variant), auto-inserting dashes every 4 digits, capped at 19 chars total. Non-digit/non-X characters are stripped except the dashes it inserts itself. The last group's 4th character may be `X` or `x` (normalized to uppercase `X`) per ORCID spec; only that position accepts a letter.

- [ ] **Step 1: Write the failing test**

Append to `MockupsSwayMobile/src/utils/collaboratorValidation.test.js` (after the existing `validateOrcid` assertions, before any final "all tests passed" log if one exists — check the file's last lines first):

```js
const { formatOrcidInput } = require('./collaboratorValidation');

assert.strictEqual(formatOrcidInput(''), '');
assert.strictEqual(formatOrcidInput('0'), '0');
assert.strictEqual(formatOrcidInput('0000'), '0000');
assert.strictEqual(formatOrcidInput('00000'), '0000-0');
assert.strictEqual(formatOrcidInput('0000000218250097'), '0000-0002-1825-0097');
assert.strictEqual(formatOrcidInput('000000021825009x'), '0000-0002-1825-009X');
assert.strictEqual(formatOrcidInput('0000-0002-1825-0097'), '0000-0002-1825-0097');
assert.strictEqual(formatOrcidInput('abcd0000-0002-1825-0097-9999'), '0000-0002-1825-0097');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node src/utils/collaboratorValidation.test.js` (from `MockupsSwayMobile/`)
Expected: throws `TypeError: formatOrcidInput is not a function`

- [ ] **Step 3: Write minimal implementation**

Add to `MockupsSwayMobile/src/utils/collaboratorValidation.js`, near `validateOrcid` (check the file's existing export style — `module.exports` object vs named `exports.x =` — and match it):

```js
function formatOrcidInput(raw) {
  let cleaned = raw.toUpperCase().replace(/[^0-9X]/g, '');
  // X is only valid as the 16th character (last digit of the last group) —
  // strip any stray X typed/pasted elsewhere.
  cleaned = cleaned
    .split('')
    .filter((ch, i) => ch !== 'X' || i === 15)
    .join('')
    .slice(0, 16);
  const groups = [];
  for (let i = 0; i < cleaned.length; i += 4) {
    groups.push(cleaned.slice(i, i + 4));
  }
  return groups.join('-');
}
```

Then export it alongside `validateOrcid` using the same mechanism the file already uses (check top of file / bottom `module.exports` block).

- [ ] **Step 4: Run test to verify it passes**

Run: `node src/utils/collaboratorValidation.test.js` (from `MockupsSwayMobile/`)
Expected: no assertion errors, script exits 0

- [ ] **Step 5: Wire into the registration form**

In `MockupsSwayMobile/src/screens/LoginScreen.js`, find the ORCID `TextInput` (around line 471-478):

```jsx
<TextInput
  style={styles.input}
  placeholder="0000-0000-0000-0000"
  placeholderTextColor={colors.text3}
  value={orcid}
  onChangeText={setOrcid}
  maxLength={50}
/>
```

Change `onChangeText` to run the value through the mask before storing it, and confirm `formatOrcidInput` is imported from `../utils/collaboratorValidation` (check the file's existing import line for that module — it already imports `validateOrcid` et al. from there for the submit-time validation):

```jsx
onChangeText={(text) => setOrcid(formatOrcidInput(text))}
```

Also reduce `maxLength` from `50` to `19` (the formatted string's exact max length: `0000-0000-0000-0000`).

- [ ] **Step 6: Commit**

```bash
git add MockupsSwayMobile/src/utils/collaboratorValidation.js MockupsSwayMobile/src/utils/collaboratorValidation.test.js MockupsSwayMobile/src/screens/LoginScreen.js
git commit -m "feat: auto-format ORCID input with dashes while typing"
```

---

### Task 2: Force logout after successful password change

**Files:**
- Modify: `MockupsSwayMobile/src/screens/ProfileScreen.js:361-387` (`handleChangePassword`)

**Interfaces:**
- Consumes: `logout()` (already imported at line 31 from `../api/client`) and `setIsLoggedIn` (already destructured from `useAuth()` at line 113) — both already used identically in `handleDeactivate` (lines 400-414), which is the pattern to copy.

- [ ] **Step 1: Confirm the current (broken) behavior by reading the code**

`handleChangePassword` (`MockupsSwayMobile/src/screens/ProfileScreen.js:361-387`) ends its success branch with:

```js
setPwForm({ actual: '', nueva: '', confirmar: '' });
Alert.alert('Contraseña actualizada', 'Vuelve a iniciar sesión.');
```

The alert tells the user to log in again, but nothing actually logs them out — the session token stays valid and the app stays on the Profile screen.

- [ ] **Step 2: Fix it**

Replace the success-branch tail with:

```js
setPwForm({ actual: '', nueva: '', confirmar: '' });
await logout();
Alert.alert('Contraseña actualizada', 'Vuelve a iniciar sesión.');
setIsLoggedIn(false);
```

(Same ordering `handleDeactivate` uses: clear local state → `logout()` → alert → flip `isLoggedIn`.)

- [ ] **Step 3: Verify manually**

No RN testing harness is configured for screen components in this repo (confirmed: `package.json` has no `test` script, only `collaboratorValidation.test.js` exists as a pure-function node script). Verify by reading the diff against `handleDeactivate`'s already-working pattern (lines 400-414) and confirming the four calls appear in the same relative order. If a device/simulator is available when this task runs, additionally: change password on a real logged-in session and confirm the app returns to the login screen.

- [ ] **Step 4: Commit**

```bash
git add MockupsSwayMobile/src/screens/ProfileScreen.js
git commit -m "fix: force logout after successful password change"
```

---

### Task 3: Fix broken URL in getAvistamientosMine

**Files:**
- Modify: `MockupsSwayMobile/src/api/client.js:244-253`

**Interfaces:**
- Produces: `getAvistamientosMine(): Promise<{success: boolean, avistamientos: Array}>` — unchanged shape, only the request URL changes. Task 4 depends on this returning real data instead of always failing.

- [ ] **Step 1: Read the current bug**

`MockupsSwayMobile/src/api/client.js:244-253`:

```js
export async function getAvistamientosMine() {
  try {
    const res = await fetch(`${API_HOST}\api\colaboradores\avistamientos`, { headers: await authHeaders() });
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error en getAvistamientosMine:', error);
    return { success: false, avistamientos: [] };
  }
}
```

The path uses `\` (backslash) instead of `/` inside a template literal — this is not a valid URL path separator, so every call to this function throws inside `fetch` and silently falls back to `{ success: false, avistamientos: [] }`. Every other client function in this file (e.g. `getEventos` two functions below it) uses forward slashes.

- [ ] **Step 2: Fix it**

```js
export async function getAvistamientosMine() {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/avistamientos`, { headers: await authHeaders() });
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error en getAvistamientosMine:', error);
    return { success: false, avistamientos: [] };
  }
}
```

- [ ] **Step 3: Verify against the running backend**

The user confirmed Docker containers `sway_api` and `sway_postgres` are running. From `MockupsSwayMobile/`, or any shell, hit the endpoint directly (needs a valid bearer token — reuse a logged-in test account, or skip auth and just confirm the route responds instead of 404):

```bash
curl -i http://localhost:8000/api/colaboradores/avistamientos
```

Expected: `401` or `403` (auth required) — NOT a client-side connection error. This confirms the path is now correct; the endpoint itself is `app/routers/colaboradores.py:443` and is unrelated to this fix.

- [ ] **Step 4: Commit**

```bash
git add MockupsSwayMobile/src/api/client.js
git commit -m "fix: correct path separators in getAvistamientosMine URL"
```

---

### Task 4: Wire Home's "Actividad reciente" to real avistamientos data

**Files:**
- Modify: `MockupsSwayMobile/src/screens/HomeScreen.js`

**Interfaces:**
- Consumes: `getAvistamientosMine()` from `../api/client` (fixed in Task 3), returning `{ success, avistamientos: [{ id, fecha, especie_nombre, especie_cientifica, notas, reportado_por, email_usuario, latitud, longitud }] }` (shape confirmed at `app/routers/colaboradores.py:464-474`).
- Produces: nothing consumed elsewhere — `recentActivity` becomes local component state instead of a module-level constant.

- [ ] **Step 1: Read current placeholder**

`MockupsSwayMobile/src/screens/HomeScreen.js:10-11` imports mock data:

```js
import { sightingsList } from '../data/sightings';
import { eventsList } from '../data/events';
```

Lines 14-41 derive `recentActivity` at module scope from `sightingsList` (mock avistamientos) and `pastEvents` (mock events the user supposedly attended). The backend has no attendance/RSVP tracking (confirmed: `GET /api/eventos` at `app/routers/eventos.py:15` returns all active events with no user linkage) — only avistamientos have real per-user history via `GET /api/colaboradores/avistamientos`. So the real version drops the "attended events" half and shows only real avistamientos.

- [ ] **Step 2: Remove the module-level mock derivation**

Delete lines 28-41 (the `recentActivity` array literal built from `sightingsList`/`pastEvents`) and the `relativeDate` helper's callers stay — `relativeDate` itself (lines 20-26) is still needed, keep it. If `pastEvents` (line 14) and `eventsList` (line 11) become unused after this deletion, remove them too — but only if nothing else in the file still references them (grep the file first; `nextEvent` at lines 16-18 also uses `eventsList` and must stay if it's still rendered elsewhere in the file).

- [ ] **Step 3: Add real data fetching**

Inside the `HomeScreen` component (near the existing `useEffect` at lines 50-58 that fetches `getProfile()`), add:

```js
const [recentActivity, setRecentActivity] = useState([]);

useEffect(() => {
  let active = true;
  getAvistamientosMine().then((data) => {
    if (!active || !data?.success) return;
    setRecentActivity(
      (data.avistamientos || [])
        .slice(0, 3)
        .map((a) => ({
          text: `Avistamiento de ${a.especie_nombre}${a.notas ? ` — ${a.notas}` : ''}`,
          date: a.fecha,
        }))
    );
  });
  return () => {
    active = false;
  };
}, []);
```

Add `getAvistamientosMine` to the existing `import { getProfile } from '../api/client';` line (line 12), and add `useState` to the existing `import { useEffect, useRef, useState } from 'react';` line (line 1) if not already present (it is already present — confirm before editing).

Backend already orders avistamientos by `fecha.desc()` (`app/routers/colaboradores.py:456`), so `.slice(0, 3)` after that ordering gives the 3 most recent — no client-side sort needed.

- [ ] **Step 4: Verify the render still works with empty state**

Read `MockupsSwayMobile/src/screens/HomeScreen.js` around line 162-170 (the `recentActivity.map(...)` JSX) — confirm it doesn't assume a non-empty array (e.g. no `recentActivity[0].text` outside the `.map`). If it renders nothing for an empty array today, that's correct behavior for a collaborator with zero avistamientos — do not add placeholder/empty-state copy that wasn't requested.

- [ ] **Step 5: Manual verification**

No RN component test harness is configured. Verify by reading the diff, confirming `getAvistamientosMine` import resolves, and confirming `relativeDate(act.date)` (used in the existing JSX at whatever line renders each activity row's date) still receives a valid ISO date string — `a.fecha` from the backend is `avistamiento.fecha.isoformat()`, same shape `relativeDate` already expects from the mock data. If a device/simulator is available when this task runs, log in as a collaborator with at least one avistamiento and confirm Home shows it instead of the old mock text ("Avistamiento de Ballena Jorobada en..." etc. from `src/data/sightings.js`).

- [ ] **Step 6: Commit**

```bash
git add MockupsSwayMobile/src/screens/HomeScreen.js
git commit -m "feat: wire actividad reciente to real avistamientos data"
```

---

## Explicitly out of scope for this plan

- **Reportes filter chips not triggering filtered requests on a real device** (`progress.md` pendiente #5): code review of `ProfileScreen.js`'s filter `useEffect` (lines 211-236), chip `onPress` handlers (lines 634-703), and `client.js`'s `buildQuery`/`getEstadisticasEspecies`/`getAvistamientosAll` found no bug — query param names match exactly what the backend expects (`app/routers/estadisticas.py:84-90`), state updates use fresh object references. This needs a live retest with a fresh Metro bundle (the device may have been running a pre-merge build when the docker logs showed no filtered requests) rather than a blind code change — do not add a task for this without new evidence.
- **Forgot-password flow** (`progress.md` pendiente #8) and **avistamientos/eventos POST wiring** (`progress.md` pendiente #4): larger, separate scopes needing their own design — user deferred these to later sessions.
- **`agent-a*` worktree cleanup** (`progress.md` pendiente #2): housekeeping, not a code task — do directly with `git worktree list`/`git worktree remove`, not SDD.
- **Expo Go → DigitalOcean API connection** (`progress.md` pendiente #10): explicitly deferred by the user to be handled last, separately from this plan.
