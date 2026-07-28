# Plan: SWAY Mobile — GamificationContext, Home Screen, Motion, Validation Hardening

**Objective:** Bring `MockupsSwayMobile/` (React Native/Expo mockup, no backend) to a
"genuinely useful, not just a web copy" state per the PI grading rubric, via: a real
gamification engine behind a single context, a global celebration overlay, a session-based
streak, a new Home dashboard screen (mobile-exclusive, no Web2 equivalent), a motion pass
using RN's built-in `Animated` (no new deps), and — the single most critical outstanding
gap — form validation hardening on the fields that already exist.

**Repo mode:** `MockupsSwayMobile/` is listed in `.gitignore` in this repo (confirmed via
`git check-ignore -v MockupsSwayMobile`). Git + `gh` ARE available and authenticated
(`EmilianoLedesma`, repo `SWAY-POO`), but the standard branch/PR-per-step workflow does
**not** apply to the actual feature files since they're untracked. This plan file itself
lives in the tracked repo (`plans/`) and can be committed normally; every step below that
touches `MockupsSwayMobile/*` is **direct-mode** (edit in place, no branch/PR, no native
git rollback available — "rollback" for those steps means re-editing back, not `git revert`).

**Stack for execution:** superpowers (writing-plans → executing-plans / subagent-driven-development)
+ caveman ultra (terse agent prompts/output) + ponytail (minimum code, no speculative
abstractions) + ecc (this blueprint, `gamification-loops` + `animation-motion-design` skills
already installed and grounding the mechanics/motion choices).

**Verification convention:** this project has no test suite and no static RN toolchain
available in this shell. The proven compile-check used all session is:
```bash
curl -s "http://localhost:8082/index.bundle?platform=android&dev=true" -o /tmp/bundle_check.js -w "HTTP:%{http_code} bytes:%{size_download}\n"
```
Expo dev server must already be running on port 8082 (`npx expo start --clear --port 8082`
from `MockupsSwayMobile/`). `HTTP:200` + a plausible byte count = compiles clean. Follow with
a `grep` for the specific symbols each step introduces to confirm the edit actually landed
(not just "didn't crash"). **Important limit:** `HTTP:200` + grep only prove the bundle
transforms without a syntax error and that the expected symbols exist — they do NOT prove
the new logic is behaviorally correct (e.g. that a badge threshold math is right, or that a
regex actually rejects bad input). Given no test suite exists, the final smoke-pass in the
"Execution order summary" (manually walking the app) is the only step that actually
exercises runtime correctness — don't report a step "done" on compile-check alone without
at least reasoning through the logic by hand.

---

## Dependency graph

```
Step 1 (validation hardening)  ──────────────────┐
                                                   ├─→ Step 4 (wire increment/bumpStreak calls)
Step 2 (GamificationContext)  ───┬───────────────┘
                                  │
                                  ├─→ Step 3 (CelebrationOverlay + mount in App.js)   ─┐
                                  ├─→ Step 5 (ProfileScreen Actividad → reads context) ─┼─→ Step 7 (motion polish pass)
                                  └─→ Step 6 (HomeScreen + 5th nav tab)               ─┘
```

**Correction from self-review:** an earlier draft of this plan incorrectly serialized
Step 4 after Step 3, reasoning that Step 4 "needs `celebrate()` to exist." That's wrong —
`celebrate()` is defined and self-triggered entirely inside Step 2's context (via the
`useEffect` diff described in Step 2's brief); Step 4 only calls plain increment/streak
functions (`incrementSightings`, `incrementSpecies`, `bumpStreak`), all defined in Step 2.
Step 4 has no functional dependency on Step 3 — Step 3 only makes the celebration
*visible*, it doesn't produce anything Step 4 calls. Fixed below.

Parallel-safe groups:
- **Group A (run together):** Step 1 + Step 2 — zero shared files.
- **Group B (run together, after Group A):** Step 3 + Step 4 + Step 5 + Step 6 — verified
  file sets don't overlap: Step 3 = `App.js` + new `CelebrationOverlay.js`; Step 4 =
  `SightingsScreen.js` + `EventsScreen.js` + `CatalogScreen.js` (same three files Step 1
  touched, which is why Step 4 needs Group A finished first, but nothing in Group B
  conflicts with it); Step 5 = `ProfileScreen.js`; Step 6 = new `HomeScreen.js` +
  `AppNavigator.js`. Four-way parallel once Group A is done.
- **Serial, last:** Step 7 needs Steps 3, 5, 6 finished (it decorates their rendered
  output). Step 7 does NOT need Step 4 — it never touches Sightings/Events/Catalog.

---

## Step 1 — Form validation hardening (Group A, parallel with Step 2)

**Model tier:** default is fine — mechanical regex/range checks, not architecture.

**Context brief (self-contained):** `MockupsSwayMobile/` is a pure-UI RN mockup (no
backend). Several forms accept input with only "is it non-empty" checks, flagged as the
single most critical gap for academic grading ("formularios que envían algo a la BD deben
estar debidamente validados" — even though there's no real BD here, the UI-level validation
rigor is what's graded). Fix four concrete gaps, matching what the real Web1 Flask form
(`templates/especies.html`) already validates:

1. `MockupsSwayMobile/src/screens/CatalogScreen.js` — the merged create/edit species form's
   save handler currently does a silent `return` if `commonName`/`scientificName` are empty
   (no user-facing error). Add an `Alert.alert('Datos incompletos', ...)` matching the
   pattern already used in `SightingsScreen.js`/`EventsScreen.js`/`LoginScreen.js`.
2. `MockupsSwayMobile/src/screens/LoginScreen.js` (register mode) — add ORCID format
   validation: `/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/` (same regex Web1 uses), only enforced if
   the field is non-empty (ORCID is optional in the mobile form per earlier session
   decision). Show a field-specific error via the existing `error` state banner if the
   pattern fails on submit.
3. `MockupsSwayMobile/src/screens/SightingsScreen.js` — `handleReportSighting` validates
   presence of `latitud`/`longitud` but not range. Add: latitud must parse as a number in
   `[-90, 90]`, longitud in `[-180, 180]` (matches Web1's `min`/`max` on those inputs).
   Reject with a clear `Alert.alert` message if out of range or not numeric.
4. `MockupsSwayMobile/src/screens/EventsScreen.js` — `handleCreateEvent` validates presence
   of `capacidadMaxima`/`costo` but not range/type. Add: `capacidadMaxima` must be a
   positive integer ≤ 10000 (matches Web1's `min=1 max=10000`), `costo` must be a
   non-negative number (matches Web1's `min=0`). Reject with `Alert.alert` if invalid.
   Also add a basic email-format check (simple `/^\S+@\S+\.\S+$/`, not a full RFC regex —
   don't over-engineer) on `contacto` in this file and on `email` in `SightingsScreen.js`
   and `LoginScreen.js`.

Keep every fix inline in the existing `handle*` functions — no new validation library, no
new abstraction file. Don't touch anything else in these files.

**Tasks:**
- [ ] Add non-silent Alert error to `CatalogScreen.js` save handler
- [ ] Add ORCID regex check to `LoginScreen.js` register submit
- [ ] Add lat/lon range validation to `SightingsScreen.js`
- [ ] Add capacidad/costo range + email regex to `EventsScreen.js`, email regex to `SightingsScreen.js` and `LoginScreen.js`

**Verification:**
```bash
curl -s "http://localhost:8082/index.bundle?platform=android&dev=true" -o /tmp/s1.js -w "HTTP:%{http_code}\n"
grep -n "orcidRegex\|-90\|-180\|10000\|@\\\\S" MockupsSwayMobile/src/screens/*.js
```
**Exit criteria:** bundle still 200s; each of the four files shows the new check present;
no existing working form (login, register-happy-path, create-species-happy-path) got a
regression (spot check by reasoning through the added `if` — it must only reject, never
block valid input).

**Rollback:** re-open each file, remove the added `if` blocks — no other state changes.

---

## Step 2 — `GamificationContext` (Group A, parallel with Step 1)

**Model tier:** strongest recommended — this is the architectural center every later step
depends on; getting the points formula and badge-threshold logic wrong here propagates.

**Context brief:** Today (per this session) `ProfileScreen.js` computes `points`/`level`/
`badges` locally, duplicated nowhere else, from static imports (`sightingsList`,
`speciesList`, past-events count). This step extracts that into a single reusable context
so `HomeScreen.js` (step 6) and a celebration trigger (step 4) can both read/react to it
without duplicating the formula. Grounded in the already-approved design and the
`gamification-loops` skill's `gameable-rewards` finding: **points must weight VERIFIED
sightings higher than PENDING ones**, not just raw count — this is a required fix, not
optional polish.

Create `MockupsSwayMobile/src/context/GamificationContext.js`:
- `GamificationProvider` wraps children, holds counters seeded from the *initial* lengths
  of `sightingsList`/`speciesList`/`eventsList` (imported once) PLUS local `useState`
  increments (`incrementSightings(verified: boolean)`, `incrementSpecies()`,
  `incrementEventAttended()`) that screens call after a successful submit — this avoids
  needing to mutate the shared mock-data module arrays (kept as a deliberate simplification,
  matches how each screen already keeps its own local `useState` copy of the list).
- Points formula (replaces old flat `count*10`): verified sightings worth 15 pts each,
  pending sightings worth 5 pts each (rewards quality, not just submission), species worth
  5 pts each, past-events-attended worth 15 pts each.
- Level thresholds: reuse the existing `LEVEL_THRESHOLDS` array already written by the
  earlier gamification-real subagent in `ProfileScreen.js` — move it here verbatim, don't
  redesign the numbers.
- Badge list + unlock logic: move the 5-badge array (Explorador inicial / Guardián del
  océano / Coleccionista de especies / Fotógrafo marino / Voluntario activo) and their
  threshold checks here verbatim from `ProfileScreen.js`, computed via `useMemo` off the
  counters above.
- Session-based streak: `streakCount` state, starts at a small seeded value (e.g. 1),
  `bumpStreak()` increments by 1 (called by the same submit handlers as the increment
  functions above), no decrement logic, no calendar/date comparison at all — this
  deliberately avoids the loss-aversion mechanic the `gamification-loops` skill's
  `sharp_edges.md` flags (`addiction-not-engagement`). Also track `bestStreak` = max seen.
- `celebration` state (`null | { icon, title, message }`) + `celebrate(payload)` setter +
  `dismissCelebration()`. A screen calls `celebrate(...)` right after an increment function
  if-and-only-if that increment just flipped a previously-locked badge to unlocked (compare
  the badges array before vs after the state update — use a `useEffect` watching the
  computed badges array, diff against a `useRef` of the previous unlocked set, call
  `celebrate` for each newly-true one).
- Export a `useGamification()` hook (`useContext` wrapper, throws if used outside provider —
  standard pattern, not overengineering).

**Tasks:**
- [ ] Create `src/context/GamificationContext.js` with provider, hook, points/level/badge/streak/celebration state exactly as above
- [ ] Do NOT touch `ProfileScreen.js` in this step (that's Step 5) — this step only creates the context file

**Verification:**
```bash
curl -s "http://localhost:8082/index.bundle?platform=android&dev=true" -o /tmp/s2.js -w "HTTP:%{http_code}\n"
node -e "require('fs').accessSync('MockupsSwayMobile/src/context/GamificationContext.js')"
```
**Exit criteria:** file exists, exports `GamificationProvider` and `useGamification`,
bundle still compiles (note: won't be *used* anywhere yet until Steps 3/5/6 — an unused
export is expected and fine at this point, not a bug).

**Rollback:** delete the file; nothing else references it yet.

---

## Step 3 — `CelebrationOverlay` + mount in `App.js` (Group B, after Group A)

**Model tier:** default.

**Context brief:** Needs Step 2's `GamificationContext` to exist (`useGamification()`
hook, `celebration`/`dismissCelebration`). Build the actual visible overlay component and
wire the provider into the app root.

- `MockupsSwayMobile/src/components/CelebrationOverlay.js` — reads `celebration` from
  `useGamification()`. When non-null, renders an absolutely-positioned full-screen overlay
  (low z-index concern in RN — just render it last / highest in the tree) with a centered
  card: badge icon, title, message. Entrance: `Animated.spring` on `scale`(0.8→1) +
  `opacity`(0→1), stiffness/damping tuned gentle (no bounce — per `impeccable`'s motion law
  and `animation-motion-design`'s "Success Feedback" pattern: spring but heavily damped,
  not elastic). Auto-dismiss via `setTimeout(dismissCelebration, 3000)` on mount; also
  tappable-to-dismiss immediately (respects the skill's "off-ramp"/no-forced-engagement
  finding). Exit animation faster than entrance (roughly 60-70% duration, per
  `exit-faster-than-enter` motion rule) — animate `opacity`→0 only on dismiss, no scale-out
  needed (keep it simple).
- `MockupsSwayMobile/App.js` — wrap the existing `<AuthProvider><StatusBar/><AppNavigator/></AuthProvider>`
  tree with `<GamificationProvider>` (outermost, alongside/inside `SafeAreaProvider` — order:
  `SafeAreaProvider > GamificationProvider > AuthProvider > (StatusBar + AppNavigator + CelebrationOverlay)`),
  and render `<CelebrationOverlay />` as a sibling to `AppNavigator`, after it, so it draws
  on top.

**Tasks:**
- [ ] Create `CelebrationOverlay.js` (Animated entrance/exit, auto+tap dismiss)
- [ ] Wrap `App.js` tree with `GamificationProvider`, mount `CelebrationOverlay` at root

**Verification:**
```bash
curl -s "http://localhost:8082/index.bundle?platform=android&dev=true" -o /tmp/s3.js -w "HTTP:%{http_code}\n"
grep -n "GamificationProvider\|CelebrationOverlay" MockupsSwayMobile/App.js
```
**Exit criteria:** bundle 200s, `App.js` shows both new symbols wired. Overlay won't visibly
trigger yet until Step 4 calls `celebrate()` from somewhere — expected, not a bug at this
point.

**Rollback:** revert `App.js` to the two-level tree, delete `CelebrationOverlay.js`.

---

## Step 4 — Wire increment/streak calls into submit handlers (Group B, after Group A only)

**Model tier:** default.

**Context brief:** Depends on Step 1 (same files — must land after validation so the new
`Alert`-based checks aren't clobbered) and Step 2 (needs `incrementSightings`,
`incrementSpecies`, `bumpStreak` to exist on the context). Does **not** depend on Step 3 —
celebration firing is entirely internal to Step 2's context (a `useEffect` there diffs the
badge-unlock set and calls its own `celebrate()`); this step only calls the plain
increment/streak functions, never `celebrate()` directly. Can run parallel with Steps 3, 5,
6 once Group A is done. Now make the real actions actually feed the gamification engine.

- `MockupsSwayMobile/src/screens/SightingsScreen.js` — in `handleReportSighting`, after the
  existing local `setSightings` call succeeds, call `useGamification()`'s
  `incrementSightings(false)` (new sightings start `PENDING`, i.e. not verified — matches
  existing `status: 'PENDING'` hardcode) and `bumpStreak()`.
- `MockupsSwayMobile/src/screens/EventsScreen.js` — in `handleCreateEvent`, after success,
  call `bumpStreak()` (creating/proposing an event counts as engagement) — do NOT call
  `incrementEventAttended()` here (that's for *attending* past events, a proposed event
  starts `UPCOMING`, not attended yet — keep the semantic distinction honest, don't just
  wire everything to everything).
- `MockupsSwayMobile/src/screens/CatalogScreen.js` — in the merged create-species save
  handler, after success on a NEW species (not an edit), call `incrementSpecies()`.

Each of these three files needs `import { useGamification } from '../context/GamificationContext'`
and `const { incrementSightings, incrementSpecies, bumpStreak } = useGamification()` (only
import what each file actually calls).

**Tasks:**
- [ ] Wire `incrementSightings` + `bumpStreak` into `SightingsScreen.js`
- [ ] Wire `bumpStreak` into `EventsScreen.js`
- [ ] Wire `incrementSpecies` into `CatalogScreen.js` (create-only, not edit)

**Verification:**
```bash
curl -s "http://localhost:8082/index.bundle?platform=android&dev=true" -o /tmp/s4.js -w "HTTP:%{http_code}\n"
grep -n "useGamification" MockupsSwayMobile/src/screens/SightingsScreen.js MockupsSwayMobile/src/screens/EventsScreen.js MockupsSwayMobile/src/screens/CatalogScreen.js
```
**Exit criteria:** all three files import and call the hook; bundle compiles; manually
reason through one flow (report a sighting → should now bump streak + sightings counter →
if that was, say, the Nth sighting where N crosses a badge threshold, `celebrate()` fires
via the `useEffect` diff inside the context, visible via Step 3's overlay).

**Rollback:** remove the added hook calls/import lines from the three files.

---

## Step 5 — `ProfileScreen.js` Actividad tab reads from context (Group B, parallel w/ 3 & 6)

**Model tier:** default.

**Context brief:** Depends only on Step 2 (context must exist). Currently
`ProfileScreen.js` has its own local `points`/`level`/`badges` computation (built earlier
this session). Replace that local computation with `useGamification()` — single source of
truth, no duplicate formula drift.

- Remove the local `points`/`level`/`badges`/`LEVEL_THRESHOLDS` computation block from
  `ProfileScreen.js`.
- Replace with `const { points, level, levelFloor, levelCeil, badges, streakCount, bestStreak } = useGamification()`.
- Keep every existing render/JSX in the Actividad tab exactly as-is (level card, progress
  bar, badge grid with per-badge progress) — only the DATA SOURCE changes, not the layout.
- Add the streak display (🔥 `streakCount` + `bestStreak` below it) to the Actividad tab
  header area, per the already-agreed design — reuse existing style tokens, don't invent
  new visual language.

**Tasks:**
- [ ] Remove local gamification computation from `ProfileScreen.js`
- [ ] Consume `useGamification()` instead
- [ ] Add streak count + best-streak display to Actividad tab

**Verification:**
```bash
curl -s "http://localhost:8082/index.bundle?platform=android&dev=true" -o /tmp/s5.js -w "HTTP:%{http_code}\n"
grep -n "useGamification\|streakCount" MockupsSwayMobile/src/screens/ProfileScreen.js
grep -c "LEVEL_THRESHOLDS" MockupsSwayMobile/src/screens/ProfileScreen.js
```
**Exit criteria:** bundle compiles; `ProfileScreen.js` no longer defines its own
`LEVEL_THRESHOLDS` (count should be 0 — moved to context); streak visible in Actividad tab.

**Rollback:** restore the local computation block (kept in this plan's history/session
notes if needed), remove the `useGamification()` call.

---

## Step 6 — `HomeScreen.js` + 5th bottom-nav tab (Group B, parallel w/ 3 & 5)

**Model tier:** default.

**Context brief:** Depends only on Step 2 (reads `useGamification()` for the level/streak
snapshot card). This is the single strongest "not just a copy of Web2" argument in the
whole plan — Web2's `Portal.jsx` has no aggregate dashboard/landing view (its `activeView`
options are only especies/avistamientos/perfil/reportes, no home overview).

- Create `MockupsSwayMobile/src/screens/HomeScreen.js`:
  - Greeting header ("Hola, {nombre}") — can hardcode a name or pull from whatever
    lightweight auth-context value already exists (check `AuthContext.js` first, don't
    invent new state if a name is already tracked there; if not, a static "Hola,
    colaborador" is an acceptable fallback — don't over-build a user-profile fetch that
    doesn't exist elsewhere in this mockup).
  - Compact level/points/streak card, reusing `useGamification()` — same data Step 5 shows
    in Perfil, presented as a shorter snapshot here (not a duplicate implementation of the
    progress-bar math — extract the tiny presentational bit into a shared component if it's
    more than ~15 lines of duplicated JSX, otherwise a straight small inline copy is fine
    per YAGNI, use judgment against actual line count once Step 5 code exists).
  - Quick actions row (3-4 items): "Reportar avistamiento", "Ver catálogo",
    "Próximo evento" (only render this one if an `UPCOMING` event exists in
    `eventsList`), "Mi perfil". Each navigates to the corresponding tab via
    `navigation.navigate('TabName')` (check exact route names already registered in
    `AppNavigator.js`'s `tabScreens` array before wiring — don't guess).
  - Recent activity list — reuse the same "3 most recent items" logic already built for
    `ProfileScreen.js`'s Actividad tab (Step 5's file) rather than re-deriving it from
    scratch; if it's cleanly extractable, pull it into a small shared helper in
    `src/utils/` or similar, otherwise a short duplicate is acceptable (same judgment call
    as above).
- `MockupsSwayMobile/src/navigation/AppNavigator.js` — add `Home` as the FIRST entry in
  `tabScreens` (before Catalog), with an appropriate Ionicons pair (e.g.
  `home-outline`/`home`). Bottom nav becomes 5 tabs total: Home, Catálogo, Avistamientos,
  Eventos, Perfil — stays within the `bottom-nav-limit` ≤5 guideline. Set
  `initialRouteName="Home"` on the `Tab.Navigator` (was `"Catalog"`).

**Tasks:**
- [ ] Create `HomeScreen.js` (greeting, gamification snapshot, quick actions, recent activity)
- [ ] Add `Home` tab first in `AppNavigator.js`'s `tabScreens`, update `initialRouteName`

**Verification:**
```bash
curl -s "http://localhost:8082/index.bundle?platform=android&dev=true" -o /tmp/s6.js -w "HTTP:%{http_code}\n"
grep -n "'Home'\|HomeScreen" MockupsSwayMobile/src/navigation/AppNavigator.js
```
**Exit criteria:** bundle compiles; nav shows 5 tabs with Home first and active on launch;
quick actions navigate to real existing tab routes (verify route names match, not
guessed).

**Rollback:** remove the `Home` entry from `tabScreens`, revert `initialRouteName`, delete
`HomeScreen.js`.

---

## Step 7 — Motion polish pass (serial, after 3 + 5 + 6)

**Model tier:** default — mechanical application of an already-agreed mapping, not a design
decision.

**Context brief:** Depends on Steps 3, 5, 6 all being done (this step only adds `Animated`
wrappers around their existing output, doesn't change logic). Grounded in
`animation-motion-design` skill's rules (animate only `transform`/`opacity`, spring not
elastic, stagger ≤50ms, exit faster than enter) and `impeccable`'s Motion law. No new
dependency — RN's built-in `Animated` API only.

Concrete additions (all already agreed with the user, just implementing):
- **Badge unlock success animation** (`ProfileScreen.js` Actividad tab, Step 5's badge
  grid) — when a badge's `unlocked` flips true, animate its icon: `Animated.spring` scale
  pop (0.5→1), matching the "Success Feedback" catalog pattern. Only animate on the
  transition (use a small per-badge `useRef`/`useState` tracking previous unlocked value,
  same diffing idea as the context's celebration trigger — don't animate on every render).
- **Progress bar fill** (locked-badge progress bars, Step 5) — animate the fill indicator
  via `Animated.timing` driving a `scaleX` transform on a `transformOrigin`-left inner bar
  (NOT animating `width` directly — that's the exact anti-pattern both motion skills flag).
- **Streak pulse** (`ProfileScreen.js` + `HomeScreen.js` streak display, Steps 5 & 6) — a
  subtle looping `opacity` breathe (e.g. 1↔0.85, ~1.2s, `useNativeDriver: true`) on the 🔥
  icon only, not the number — respect `AccessibilityInfo.isReduceMotionEnabled()`: skip/no-op
  the loop entirely if reduce-motion is on (check once on mount, don't poll).
- **Button press feedback** — any NEW buttons this plan introduces (Home quick-actions,
  in `HomeScreen.js`) get `Animated.spring` scale-to-0.97 on press-in, back to 1 on
  press-out (`Pressable`'s built-in `onPressIn`/`onPressOut`, or wrap `TouchableOpacity` if
  that's the existing convention in this codebase — check what Step 6 actually used and
  match it, don't introduce a second touchable convention).
- **Home quick-actions entrance stagger** — on `HomeScreen` mount, stagger the 3-4
  quick-action cards' fade+slight-translateY-in by ~40ms each (`Animated.stagger`), capped
  at the 4 real items — this list will never grow beyond 4 so no virtualization/viewport
  concern applies (the `virtualize-lists`/`stagger-performance` guidance is about large
  lists, not relevant here — don't add complexity for a problem that doesn't exist in this
  screen).
- **CelebrationOverlay** (Step 3) — already speced with entrance/exit in Step 3 itself;
  this step just confirms it matches the same spring-damping character as everything else
  added here (visual consistency check, not new code, unless Step 3 drifted from the
  pattern — fix in place if so).

**Tasks:**
- [ ] Badge-unlock scale-pop animation in `ProfileScreen.js`
- [ ] Progress-bar fill via `scaleX` `Animated.timing`, not `width`
- [ ] Streak pulse (opacity breathe) in `ProfileScreen.js` + `HomeScreen.js`, reduced-motion aware
- [ ] Press-scale feedback on `HomeScreen.js` quick-action buttons
- [ ] Staggered entrance for `HomeScreen.js` quick-actions (≤4 items)
- [ ] Sanity-check `CelebrationOverlay` spring params match the same "gentle, no bounce" feel

**Verification:**
```bash
curl -s "http://localhost:8082/index.bundle?platform=android&dev=true" -o /tmp/s7.js -w "HTTP:%{http_code}\n"
grep -n "Animated\." MockupsSwayMobile/src/screens/ProfileScreen.js MockupsSwayMobile/src/screens/HomeScreen.js MockupsSwayMobile/src/components/CelebrationOverlay.js
grep -n "isReduceMotionEnabled" MockupsSwayMobile/src/screens/ProfileScreen.js MockupsSwayMobile/src/screens/HomeScreen.js
```
**Exit criteria:** bundle compiles; every listed animation present; no `width`/`height`/
`margin`/`top`/`left` animated (grep for `Animated.timing` / `Animated.spring` calls and
manually confirm each only drives `transform`/`opacity`); reduce-motion check present at
least once for the looping streak pulse (the only non-one-shot animation in this batch —
one-shot entrance/press animations don't strictly need the check per the skill, but the
looping one does since it never naturally stops).

**Rollback:** each animation is additive (`Animated.Value` + wrapper) around existing static
JSX — remove the wrapper, keep the static render underneath untouched.

---

## Execution order summary

1. Dispatch Step 1 + Step 2 **in parallel** (no shared files).
2. Once both done, dispatch Step 3 + Step 4 + Step 5 + Step 6 **in parallel** (four-way —
   file sets verified non-overlapping above; Step 4 only needed Group A finished, not Step 3).
3. Once Steps 3, 5, 6 all done, run Step 7 (serial — decorates their combined output; does
   not need Step 4).
4. Full-app smoke pass: reload the Expo dev client, walk Login → Home → report a sighting
   (should bump streak, maybe trigger a celebration) → check Perfil → Reportes → Cuenta →
   Actividad shows the same numbers Home showed.

**No branch/PR steps** — direct-mode edits per the repo-mode note at the top. If the user
later wants this tracked in git, that's a separate decision (currently `MockupsSwayMobile/`
is deliberately gitignored) — not assumed by this plan.
