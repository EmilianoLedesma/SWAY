# Mobile Bugs Fix (4 bugs) + Photo Source Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 independent mobile bugs found via root-cause investigation: (1) realtime clients never see a sighting's photo because no event fires after upload, (2) Home streak chip is a dead button, (3) Sightings cards use a "Ver" button instead of a touchable card like Events, (4) the species search filter in Reportes → Global works but gives no visual feedback so it feels dead. Plus one small UX addition: (5) let the user choose camera vs. photo library when adding a sighting photo, instead of always opening the camera immediately.

**Architecture:** Bug 1 needs a new backend realtime event (`avistamiento_updated`) published after photo upload, plus a mobile merge function and a subscribe-handler case. Bugs 2-4 and item 5 are self-contained mobile-only UI wiring/cleanup, no backend changes.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React Native / Expo, `@react-navigation/native` (mobile).

## Global Constraints

- Root cause for bug 1 already confirmed (see investigation): `POST /api/reportar-avistamiento` publishes `avistamiento_created` with `foto_url: null` because the photo is uploaded in a separate, later request (`POST /api/avistamientos/{id}/foto`), and that second endpoint never publishes any event.
- Bug 4 input (`ProfileScreen.js:803-809`, `especieSearch` state) is NOT dead — it is fully wired end-to-end (debounced match → `filtros.especieId` → `especie_id` query param → `estadisticas.py:370-371` backend filter). User decision: keep it, add visual feedback instead of deleting.
- Bug 2 user decision: streak card navigates to Profile tab AND auto-selects the "Actividad" tab (`activeTab === 'activity'` in `ProfileScreen.js`, no separate screen exists).
- JS tests in this repo use plain `node assert` scripts (no test framework), run directly with `node <file>.test.js`. See `MockupsSwayMobile/src/context/realtimeMerge.test.js` for the existing pattern.
- Python tests use `pytest` + `TestClient`, existing DB fixtures in `test/conftest.py` (`TestSession`).
- Don't touch unrelated code. Match existing style exactly (no refactors beyond what each task requires).

---

### Task 1: Backend — publish `avistamiento_updated` after photo upload

**Files:**
- Modify: `app/routers/estadisticas.py:296-305` (`subir_foto_avistamiento`)
- Test: `test/test_subir_foto_avistamiento.py`

**Interfaces:**
- Consumes: existing `publish_event(event_type: str, payload: dict) -> None` from `app.services.realtime_publish` (already imported at `estadisticas.py:16`).
- Produces: a new realtime event `avistamiento_updated` with payload `{"id": int, "foto_url": str}`, consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Add to `test/test_subir_foto_avistamiento.py` (after the imports, use `monkeypatch` fixture — add it as a parameter to the new test):

```python
def test_upload_publishes_avistamiento_updated_event(monkeypatch):
    published = []
    monkeypatch.setattr(
        "app.routers.estadisticas.publish_event",
        lambda event_type, payload: published.append((event_type, payload)),
    )

    avistamiento_id = _seed_avistamiento()
    resp = client.post(
        f"/api/avistamientos/{avistamiento_id}/foto",
        files={"foto": ("photo.jpg", io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-bytes"), "image/jpeg")},
    )
    assert resp.status_code == 200
    foto_url = resp.json()["foto_url"]

    assert len(published) == 1
    event_type, payload = published[0]
    assert event_type == "avistamiento_updated"
    assert payload == {"id": avistamiento_id, "foto_url": foto_url}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest test/test_subir_foto_avistamiento.py::test_upload_publishes_avistamiento_updated_event -v`
Expected: FAIL (`assert len(published) == 1` fails, `published` is empty — no event is published today).

- [ ] **Step 3: Implement the fix**

In `app/routers/estadisticas.py`, current code at lines 296-305:

```python
        nombre_archivo = f"{uuid.uuid4().hex}{extension}"
        os.makedirs(AVISTAMIENTOS_UPLOAD_DIR, exist_ok=True)
        ruta_absoluta = os.path.join(AVISTAMIENTOS_UPLOAD_DIR, nombre_archivo)
        with open(ruta_absoluta, "wb") as f:
            f.write(contenido)

        avistamiento.foto_url = f"/api/uploads/avistamientos/{nombre_archivo}"
        db.commit()

        return {"success": True, "foto_url": avistamiento.foto_url}
```

Change to:

```python
        nombre_archivo = f"{uuid.uuid4().hex}{extension}"
        os.makedirs(AVISTAMIENTOS_UPLOAD_DIR, exist_ok=True)
        ruta_absoluta = os.path.join(AVISTAMIENTOS_UPLOAD_DIR, nombre_archivo)
        with open(ruta_absoluta, "wb") as f:
            f.write(contenido)

        avistamiento.foto_url = f"/api/uploads/avistamientos/{nombre_archivo}"
        db.commit()

        publish_event("avistamiento_updated", {
            "id": avistamiento.id,
            "foto_url": avistamiento.foto_url,
        })

        return {"success": True, "foto_url": avistamiento.foto_url}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest test/test_subir_foto_avistamiento.py -v`
Expected: all tests in the file PASS (4 total, including the 3 pre-existing ones — confirm no regression).

- [ ] **Step 5: Commit**

```bash
git add app/routers/estadisticas.py test/test_subir_foto_avistamiento.py
git commit -m "fix: publish avistamiento_updated event after photo upload"
```

---

### Task 2: Mobile — `patchById` realtime merge helper

**Files:**
- Modify: `MockupsSwayMobile/src/context/realtimeMerge.js`
- Modify: `MockupsSwayMobile/src/context/realtimeMerge.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `patchById(prev, id, patch)` — returns a new array with the item matching `id` (string comparison, matching the existing `removeById` convention) shallow-merged with `patch`; returns `prev` unchanged (same reference) if no item matches. Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Add to `MockupsSwayMobile/src/context/realtimeMerge.test.js`, before the final `console.log` line:

```js
// patchById: merges patch into the matching item, leaves others untouched
{
  const prev = [{ id: '1', hasPhoto: false, photoUrl: null }, { id: '2', hasPhoto: false, photoUrl: null }];
  const result = patchById(prev, '1', { hasPhoto: true, photoUrl: 'http://x/photo.jpg' });
  assert.deepStrictEqual(result, [
    { id: '1', hasPhoto: true, photoUrl: 'http://x/photo.jpg' },
    { id: '2', hasPhoto: false, photoUrl: null },
  ]);
}

// patchById: no-op (same reference) if id not present
{
  const prev = [{ id: '1', hasPhoto: false }];
  const result = patchById(prev, '999', { hasPhoto: true });
  assert.strictEqual(result, prev);
}
```

Also update the require line at the top of the test file:

```js
const { mergeAvistamientoCreated, removeById, patchById } = require('./realtimeMerge');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node MockupsSwayMobile/src/context/realtimeMerge.test.js`
Expected: FAIL with `TypeError: patchById is not a function`.

- [ ] **Step 3: Implement `patchById`**

In `MockupsSwayMobile/src/context/realtimeMerge.js`, current file:

```js
function mergeAvistamientoCreated(prev, mapped) {
  if (prev.some((s) => s.id === mapped.id)) return prev;
  return [mapped, ...prev];
}

function removeById(prev, id) {
  return prev.filter((s) => s.id !== id);
}

module.exports = { mergeAvistamientoCreated, removeById };
```

Change to:

```js
function mergeAvistamientoCreated(prev, mapped) {
  if (prev.some((s) => s.id === mapped.id)) return prev;
  return [mapped, ...prev];
}

function removeById(prev, id) {
  return prev.filter((s) => s.id !== id);
}

function patchById(prev, id, patch) {
  if (!prev.some((s) => s.id === id)) return prev;
  return prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

module.exports = { mergeAvistamientoCreated, removeById, patchById };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node MockupsSwayMobile/src/context/realtimeMerge.test.js`
Expected: `realtimeMerge.test.js: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add MockupsSwayMobile/src/context/realtimeMerge.js MockupsSwayMobile/src/context/realtimeMerge.test.js
git commit -m "feat: add patchById realtime merge helper"
```

---

### Task 3: Mobile — wire `avistamiento_updated` in SightingsScreen

**Files:**
- Modify: `MockupsSwayMobile/src/screens/SightingsScreen.js:33` (import) and `:109-129` (subscribe handler)

**Interfaces:**
- Consumes: `patchById` from Task 2 (`../context/realtimeMerge`); `avistamiento_updated` event payload `{"id": int, "foto_url": string}` from Task 1 (note: `id` arrives as a JS number, must be stringified before comparing — same pattern already used for `avistamiento_deleted` at line 125).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Update the import**

Current line 33:

```js
import { mergeAvistamientoCreated, removeById } from '../context/realtimeMerge';
```

Change to:

```js
import { mergeAvistamientoCreated, removeById, patchById } from '../context/realtimeMerge';
```

- [ ] **Step 2: Add the `avistamiento_updated` case to the subscribe handler**

Current code at lines 109-129:

```js
  useEffect(() => {
    const unsubscribe = subscribe((message) => {
      if (message.type === 'resync') {
        const fetchSightings = showMineOnly ? getAvistamientosMine : getAvistamientosAll;
        fetchSightings().then((data) => {
          setSightings(data?.avistamientos ? data.avistamientos.map(mapAvistamientoFromApi) : []);
        });
        return;
      }
      if (message.type === 'avistamiento_created') {
        if (showMineOnly && message.payload.email_usuario !== colaboradorProfile?.email) {
          return;
        }
        setSightings((prev) => mergeAvistamientoCreated(prev, mapAvistamientoFromApi(message.payload)));
      }
      if (message.type === 'avistamiento_deleted') {
        setSightings((prev) => removeById(prev, String(message.payload.id)));
      }
    });
    return unsubscribe;
  }, [showMineOnly, colaboradorProfile]);
```

Change to (adds one `if` block, mirrors the mapping done in `mapAvistamientoFromApi` for `hasPhoto`/`photoUrl` at lines 50-51):

```js
  useEffect(() => {
    const unsubscribe = subscribe((message) => {
      if (message.type === 'resync') {
        const fetchSightings = showMineOnly ? getAvistamientosMine : getAvistamientosAll;
        fetchSightings().then((data) => {
          setSightings(data?.avistamientos ? data.avistamientos.map(mapAvistamientoFromApi) : []);
        });
        return;
      }
      if (message.type === 'avistamiento_created') {
        if (showMineOnly && message.payload.email_usuario !== colaboradorProfile?.email) {
          return;
        }
        setSightings((prev) => mergeAvistamientoCreated(prev, mapAvistamientoFromApi(message.payload)));
      }
      if (message.type === 'avistamiento_deleted') {
        setSightings((prev) => removeById(prev, String(message.payload.id)));
      }
      if (message.type === 'avistamiento_updated') {
        const { id, foto_url } = message.payload;
        setSightings((prev) =>
          patchById(prev, String(id), {
            hasPhoto: !!foto_url,
            photoUrl: foto_url ? `${API_HOST}${foto_url}` : null,
          }),
        );
      }
    });
    return unsubscribe;
  }, [showMineOnly, colaboradorProfile]);
```

- [ ] **Step 3: Manual verification (no automated RN component test harness in this repo)**

Run: `node -e "require('./MockupsSwayMobile/src/context/realtimeMerge.js')"` to confirm no syntax errors in the merge module (sanity check only — the real verification is the two-device Expo Go test in Task 7).

- [ ] **Step 4: Commit**

```bash
git add MockupsSwayMobile/src/screens/SightingsScreen.js
git commit -m "fix: patch photo into sighting card on avistamiento_updated realtime event"
```

---

### Task 4: Mobile — SightingsScreen: touchable card opens detail, remove "Ver" button

**Files:**
- Modify: `MockupsSwayMobile/src/screens/SightingsScreen.js:306` (card container) and `:351-359` (remove "Ver" button)

**Interfaces:**
- Consumes: nothing new. Mirrors the pattern already used in `EventsScreen.js:376-435` (outer `TouchableOpacity` wraps the card, nested action buttons keep working via React Native's responder-capture — no extra code needed to prevent bubbling).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Replace the card container `View` with a touchable, and remove the "Ver" button**

Current code, `SightingsScreen.js:306-380` (the full `styles.timelineCard` block, inside `renderTimelineItem`):

```jsx
        <View style={styles.timelineCard}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.cardIcon}>
                {item.photoUrl ? (
                  <Image
                    source={{ uri: item.photoUrl }}
                    style={styles.cardThumbnail}
                    onError={() => {}}
                  />
                ) : (
                  <Ionicons name="camera" size={16} color={colors.ocean} />
                )}
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardSpecies}>{item.species}</Text>
                {item.reporter ? (
                  <Text style={styles.cardReporter}>por {item.reporter}</Text>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.cardMeta}>
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={13} color={colors.text3} />
              <Text style={styles.metaText}>{item.date}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={13} color={colors.text3} />
              <Text style={styles.metaText} numberOfLines={1}>
                {item.location}
              </Text>
            </View>
            {item.hasPhoto && (
              <View style={styles.metaRow}>
                <Ionicons name="image-outline" size={13} color={colors.blue} />
                <Text style={[styles.metaText, { color: colors.blue }]}>
                  Con foto
                </Text>
              </View>
            )}
          </View>

          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setDetailSighting(item)}
            >
              <Ionicons name="eye-outline" size={15} color={colors.blue} />
              <Text style={[styles.actionLabel, { color: colors.blue }]}>
                Ver
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleShare(item)}>
              <Ionicons
                name="share-outline"
                size={15}
                color={colors.text2}
              />
              <Text style={[styles.actionLabel, { color: colors.text2 }]}>
                Compartir
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleDelete(item)}
            >
              <Ionicons name="trash-outline" size={15} color={colors.red} />
              <Text style={[styles.actionLabel, { color: colors.red }]}>
                Eliminar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
```

Replace with (outer `View` → `TouchableOpacity` with `onPress`/`activeOpacity`, "Ver" button block deleted, "Compartir"/"Eliminar" untouched and still nested inside):

```jsx
        <TouchableOpacity
          style={styles.timelineCard}
          onPress={() => setDetailSighting(item)}
          activeOpacity={0.7}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.cardIcon}>
                {item.photoUrl ? (
                  <Image
                    source={{ uri: item.photoUrl }}
                    style={styles.cardThumbnail}
                    onError={() => {}}
                  />
                ) : (
                  <Ionicons name="camera" size={16} color={colors.ocean} />
                )}
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardSpecies}>{item.species}</Text>
                {item.reporter ? (
                  <Text style={styles.cardReporter}>por {item.reporter}</Text>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.cardMeta}>
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={13} color={colors.text3} />
              <Text style={styles.metaText}>{item.date}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={13} color={colors.text3} />
              <Text style={styles.metaText} numberOfLines={1}>
                {item.location}
              </Text>
            </View>
            {item.hasPhoto && (
              <View style={styles.metaRow}>
                <Ionicons name="image-outline" size={13} color={colors.blue} />
                <Text style={[styles.metaText, { color: colors.blue }]}>
                  Con foto
                </Text>
              </View>
            )}
          </View>

          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleShare(item)}>
              <Ionicons
                name="share-outline"
                size={15}
                color={colors.text2}
              />
              <Text style={[styles.actionLabel, { color: colors.text2 }]}>
                Compartir
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleDelete(item)}
            >
              <Ionicons name="trash-outline" size={15} color={colors.red} />
              <Text style={[styles.actionLabel, { color: colors.red }]}>
                Eliminar
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
```

Nested "Compartir"/"Eliminar" `TouchableOpacity`s keep working exactly like `EventsScreen.js`'s equivalents (RN gesture-responder system claims the innermost touchable, no `stopPropagation` needed, no extra code required).

- [ ] **Step 2: Verify no leftover unused styles**

Check if `styles.actionBtn`'s label color override (`{ color: colors.blue }`) or the `eye-outline` icon import (`Ionicons`) is used anywhere else in the file — `Ionicons` is used elsewhere (keep the import), no style cleanup needed since `styles.actionBtn` is still used by "Compartir"/"Eliminar".

- [ ] **Step 3: Manual verification**

Run the app (`npx expo start` from `MockupsSwayMobile/`), open Avistamientos tab, tap anywhere on a card (not on Compartir/Eliminar) → detail modal opens. Tap "Compartir" → share sheet opens, detail modal does NOT open. Tap "Eliminar" → delete confirmation opens, detail modal does NOT open.

- [ ] **Step 4: Commit**

```bash
git add MockupsSwayMobile/src/screens/SightingsScreen.js
git commit -m "refactor: make sighting card fully touchable, remove redundant Ver button"
```

---

### Task 5: Mobile — Home streak chip navigates to Profile → Actividad tab

**Files:**
- Modify: `MockupsSwayMobile/src/screens/HomeScreen.js:99-102`

**Interfaces:**
- Consumes: `navigation` prop (already destructured at `HomeScreen.js:26`, `export default function HomeScreen({ navigation })`).
- Produces: navigation call `navigation.navigate('Profile', { initialTab: 'activity' })` — the `initialTab` param contract consumed by Task 6.

- [ ] **Step 1: Make the streak chip touchable**

Current code at lines 99-102:

```jsx
            <View style={styles.streakChip}>
              <Animated.Text style={[styles.streakIcon, { opacity: streakPulse }]}>🔥</Animated.Text>
              <Text style={styles.streakText}>{streakCount}</Text>
            </View>
```

Change to:

```jsx
            <TouchableOpacity
              style={styles.streakChip}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('Profile', { initialTab: 'activity' })}
            >
              <Animated.Text style={[styles.streakIcon, { opacity: streakPulse }]}>🔥</Animated.Text>
              <Text style={styles.streakText}>{streakCount}</Text>
            </TouchableOpacity>
```

`TouchableOpacity` is already imported at `HomeScreen.js:2` — no new import needed.

- [ ] **Step 2: Manual verification (requires Task 6 to be meaningful, but the navigation call itself can be checked standalone)**

Run the app, on Home tap the 🔥 streak chip → should switch to the Profile tab (full behavior — landing on the "Actividad" sub-tab — verified in Task 6/7).

- [ ] **Step 3: Commit**

```bash
git add MockupsSwayMobile/src/screens/HomeScreen.js
git commit -m "fix: wire streak chip to navigate to Profile Actividad tab"
```

---

### Task 6: Mobile — ProfileScreen consumes `initialTab` param, selects Actividad tab

**Files:**
- Modify: `MockupsSwayMobile/src/screens/ProfileScreen.js:1` (imports), `:101` (function signature)

**Interfaces:**
- Consumes: `route.params.initialTab` (string, e.g. `'activity'`) sent by Task 5.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Import `useFocusEffect`**

Current imports at `ProfileScreen.js:1`:

```js
import { useState, useEffect, useRef } from 'react';
```

Add a new import line right after it:

```js
import { useFocusEffect } from '@react-navigation/native';
```

- [ ] **Step 2: Accept `navigation`/`route` props and consume the param**

Current line 101:

```js
export default function ProfileScreen() {
```

Change to:

```js
export default function ProfileScreen({ navigation, route }) {
```

Find the line `const [activeTab, setActiveTab] = useState('personal');` (line 114) and add this `useFocusEffect` immediately after it:

```js
  useFocusEffect(
    React.useCallback(() => {
      if (route?.params?.initialTab) {
        setActiveTab(route.params.initialTab);
        navigation.setParams({ initialTab: undefined });
      }
    }, [route?.params?.initialTab, navigation]),
  );
```

Since this file imports hooks individually (`import { useState, useEffect, useRef } from 'react';`) rather than `import React from 'react'`, use `useCallback` the same way — add `useCallback` to the existing React import instead of writing `React.useCallback`:

Change the react import (Step 1's target line) to:

```js
import { useState, useEffect, useRef, useCallback } from 'react';
```

And use the callback without the `React.` prefix:

```js
  useFocusEffect(
    useCallback(() => {
      if (route?.params?.initialTab) {
        setActiveTab(route.params.initialTab);
        navigation.setParams({ initialTab: undefined });
      }
    }, [route?.params?.initialTab, navigation]),
  );
```

- [ ] **Step 3: Manual verification**

Run the app, on Home tap the 🔥 streak chip → lands on Profile tab with "Actividad" already selected (badges + "Actividad reciente" visible, not "Datos personales"). Manually switch to another Profile sub-tab (e.g. "Personal"), switch away to another bottom tab and back to Profile (without tapping the streak chip again) → should stay on "Personal" (param was consumed/cleared, doesn't force-override manual tab choice).

- [ ] **Step 4: Commit**

```bash
git add MockupsSwayMobile/src/screens/ProfileScreen.js
git commit -m "feat: ProfileScreen selects initial tab from navigation param"
```

---

### Task 7: Mobile — visual feedback for the species search filter (Reportes → Global)

**Files:**
- Modify: `MockupsSwayMobile/src/screens/ProfileScreen.js:284-295` (existing debounce effect) and `:803-809` (the `TextInput`)

**Interfaces:**
- Consumes: existing `especieSearch`/`especiesCatalog`/`filtros` state (already declared in the file).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Track match status alongside the existing debounce effect**

Current code at lines 284-295:

```js
  useEffect(() => {
    if (reportesSubTab !== 'global') return;
    const handle = setTimeout(() => {
      const match = especieSearch.trim()
        ? especiesCatalog.find((e) =>
            e.nombre_comun?.toLowerCase().includes(especieSearch.trim().toLowerCase())
          )
        : null;
      setFiltros((f) => ({ ...f, especieId: match?.id }));
    }, 400);
    return () => clearTimeout(handle);
  }, [especieSearch, especiesCatalog, reportesSubTab]);
```

Change to (adds one new `useState` line right before it, and stores the matched name for display):

```js
  const [especieMatchName, setEspecieMatchName] = useState(null);

  useEffect(() => {
    if (reportesSubTab !== 'global') return;
    const handle = setTimeout(() => {
      const match = especieSearch.trim()
        ? especiesCatalog.find((e) =>
            e.nombre_comun?.toLowerCase().includes(especieSearch.trim().toLowerCase())
          )
        : null;
      setFiltros((f) => ({ ...f, especieId: match?.id }));
      setEspecieMatchName(match?.nombre_comun ?? null);
    }, 400);
    return () => clearTimeout(handle);
  }, [especieSearch, especiesCatalog, reportesSubTab]);
```

- [ ] **Step 2: Render feedback text below the input**

Current code at lines 803-809:

```jsx
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Buscar especie..."
                  placeholderTextColor={colors.text3}
                  value={especieSearch}
                  onChangeText={setEspecieSearch}
                />
```

Change to:

```jsx
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Buscar especie..."
                  placeholderTextColor={colors.text3}
                  value={especieSearch}
                  onChangeText={setEspecieSearch}
                />
                {especieSearch.trim() !== '' && (
                  <Text style={[styles.reportsDesc, { marginTop: 4, marginBottom: 0 }]}>
                    {especieMatchName ? `Filtrando: ${especieMatchName}` : 'Sin coincidencias'}
                  </Text>
                )}
```

`styles.reportsDesc` already exists in this file (used elsewhere for secondary/helper text, e.g. line 815 in the loading state) — reuses the existing style instead of adding a new one.

- [ ] **Step 3: Manual verification**

Run the app, go to Perfil → Reportes → Global, type a partial species name that exists in the catalog → after ~400ms, text below the input reads "Filtrando: <nombre completo>" and the stats/list update to that species. Type a name that matches nothing → text reads "Sin coincidencias". Clear the input → feedback text disappears, filter clears.

- [ ] **Step 4: Commit**

```bash
git add MockupsSwayMobile/src/screens/ProfileScreen.js
git commit -m "feat: show match feedback for species search filter"
```

---

### Task 8: Mobile — choose camera or gallery before capturing avistamiento photo

**Files:**
- Modify: `MockupsSwayMobile/src/screens/SightingsScreen.js:180-190` (`handleCapturePhoto`)

**Interfaces:**
- Consumes: `ImagePicker` (`expo-image-picker`, already imported at `SightingsScreen.js:16`), `Alert` (already imported at line 10).
- Produces: nothing new for later tasks. `sightingForm.fotoUri` contract unchanged — both paths end by calling `setField('fotoUri', uri)`, exactly like today.

Currently, pressing "Capturar foto de la especie" (button at `SightingsScreen.js:569`, label at line 579) calls `handleCapturePhoto`, which immediately requests camera permission and opens the camera — no choice is offered. Add a chooser (camera vs. photo library) before either picker opens, reusing the same `Alert.alert` multi-button pattern already used in this file for `handleDelete` (`SightingsScreen.js:275-300`).

- [ ] **Step 1: Write the failing/reproducing check (manual, no test harness for RN pickers in this repo)**

There is no automated test harness for `expo-image-picker` flows in this codebase (native module, requires a device/simulator) — skip straight to Step 2, verify manually in Step 4 per the existing pattern used for all other RN UI changes in this plan (Tasks 4-7).

- [ ] **Step 2: Split `handleCapturePhoto` into a chooser plus two picker functions**

Current code, `SightingsScreen.js:180-190`:

```js
  const handleCapturePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Activa el permiso de cámara para usar esta función.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) {
      setField('fotoUri', result.assets[0].uri);
    }
  };
```

Replace with:

```js
  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Activa el permiso de cámara para usar esta función.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) {
      setField('fotoUri', result.assets[0].uri);
    }
  };

  const handlePickPhotoFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Activa el permiso de galería para usar esta función.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (!result.canceled) {
      setField('fotoUri', result.assets[0].uri);
    }
  };

  const handleCapturePhoto = () => {
    Alert.alert(
      'Foto de la especie',
      '¿Cómo quieres agregar la foto?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Elegir de galería', onPress: handlePickPhotoFromGallery },
        { text: 'Tomar foto', onPress: handleTakePhoto },
      ],
    );
  };
```

`handleCapturePhoto` keeps its exact name and signature (`() => void`, called with no args), so the button wiring at `SightingsScreen.js:569` (`onPress={handleCapturePhoto}`) does not need to change.

- [ ] **Step 3: No new imports needed**

`ImagePicker.requestMediaLibraryPermissionsAsync` and `ImagePicker.launchImageLibraryAsync` are part of the already-imported `expo-image-picker` module (`import * as ImagePicker from 'expo-image-picker';`, line 16) — this project is on `expo-image-picker ~17.0.11` (SDK 54), both functions are stable/current in that version. Per this repo's `AGENTS.md` ("Expo HAS CHANGED, read exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code"), the implementer should still confirm current signatures against that URL before writing code, even though this plan's snippets already reflect the current API.

- [ ] **Step 4: Manual verification**

Run the app (`npx expo start` from `MockupsSwayMobile/`), open Avistamientos → "+" → tap "Capturar foto de la especie" → an alert with 3 options appears ("Cancelar" / "Elegir de galería" / "Tomar foto"). Tap "Tomar foto" → camera permission prompt (if not already granted) → camera opens → captured photo shows as thumbnail, label changes to "Foto capturada". Repeat from a fresh form, tap "Elegir de galería" → library permission prompt (if not already granted) → photo library opens → selected photo shows as thumbnail, same label change. Tap "Cancelar" → no picker opens, form unchanged.

- [ ] **Step 5: Commit**

```bash
git add MockupsSwayMobile/src/screens/SightingsScreen.js
git commit -m "feat: choose camera or gallery when adding a sighting photo"
```

---

### Task 9: Final verification — full test suite + Expo Go two-device check

**Files:** none (verification only)

- [ ] **Step 1: Run backend test suite**

Run: `python -m pytest test/ -q`
Expected: all tests pass (pre-existing broken files `test_home.py`/`test_integration_create_especie.py` are known-unrelated failures per `progress.md` — confirm no NEW failures beyond those two).

- [ ] **Step 2: Run mobile JS test suite**

Run: `node MockupsSwayMobile/src/context/realtimeMerge.test.js && node MockupsSwayMobile/src/context/gamificationBadges.test.js`
Expected: both print `all assertions passed`.

- [ ] **Step 3: Two-device Expo Go manual check for Bug 1 (the only bug needing multi-device verification)**

With two devices/simulators on Expo Go connected to the same dev server (or against the deployed droplet, matching whatever `API_HOST` is currently set to): on device A, report a new avistamiento with a photo. On device B (already viewing the Sightings list), confirm the card appears immediately via `avistamiento_created` (no photo yet, expected), then within a second or two the photo thumbnail appears on device B's card via the new `avistamiento_updated` event — without device B doing any manual refresh/refetch.

- [ ] **Step 4: Report results to the user**

Summarize pass/fail for each of the 4 bugs plus item 5, based on manual checks in Tasks 4, 6, 7, 8, and this task's Step 3. Do not claim success without having actually run these checks (per `superpowers:verification-before-completion`).
