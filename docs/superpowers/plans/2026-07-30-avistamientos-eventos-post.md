# Avistamientos y Eventos POST Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire real `POST` calls for reporting an avistamiento and proposing an evento in the mobile app (`MockupsSwayMobile`), replacing the current local-state-only mocks.

**Architecture:** Both backend endpoints already exist and work (`POST /api/reportar-avistamiento` in `app/routers/estadisticas.py`, `POST /api/eventos/crear` + `GET /api/tipos-evento` + `GET /api/modalidades` in `app/routers/eventos.py`) — zero backend changes. Add four thin fetch wrappers to `client.js` following the file's existing pattern exactly, then rewire the two screens to call them and refetch from the list endpoints on success instead of pushing a fake local object.

**Tech Stack:** React Native (Expo), plain `fetch`, no new dependencies.

## Global Constraints

- **Amended after Task 1's curl verification (2026-07-30):** `POST /api/eventos/crear` has a real backend bug — its auth dependency `get_optional_tienda_user` (`app/security/auth.py:61`) only recognizes `token_type == "tienda"` (web2 shop-customer tokens). A mobile colaborador's JWT (`token_type == "colaborador"`) is silently treated as no-token, so the endpoint always falls into its guest-user-creation branch, which then crashes with a `UniqueViolation` because the colaborador's email already has a `Usuario` row. Confirmed via curl with a real login token, not a client-side issue. **Task 5 below fixes it** — this is now in scope for this plan (the original "no backend changes" assumption was wrong for this one endpoint).
- `POST /api/reportar-avistamiento` remains verified working as-is, no backend change needed for it (see `docs/superpowers/specs/2026-07-30-avistamientos-eventos-post-design.md`).
- Do not touch `API_HOST` / `client.js`'s dev-host resolution logic — explicitly out of scope (`progress.md` pendiente #10), only touch it if the user explicitly asks later.
- Follow `client.js`'s existing per-function pattern: `try/catch`, `fetch`, `res.json()`, `buildErrorResult(res, data, fallback)` on `!res.ok`, `console.error` in `catch`. Do not introduce a different error-handling style.
- No new test framework — this repo's only JS test convention is a plain `node assert` script (`src/utils/collaboratorValidation.test.js`), used for shared/reusable validation logic. The new logic here (fetch wrappers, one-line form transforms) is neither reusable nor branchy enough to warrant a new module+test; verify via manual `curl` against the running backend instead, matching how the collaborator-registration session (`progress.md` section B) verified its backend contract.
- Remove the "especie no catalogada" toggle from `SightingsScreen.js` entirely (catalog-only species going forward) — this is a decided scope cut, not a bug.
- Don't send `fotoUri` in the avistamiento POST — no backend column/endpoint for it. Keep the camera button working for local preview/share-card only.

---

### Task 1: `client.js` — add the four API functions

**Files:**
- Modify: `MockupsSwayMobile/src/api/client.js`

**Interfaces:**
- Produces: `crearAvistamiento(payload)` → `Promise<{success: boolean, message?: string, sessionExpired?: boolean}>`. `payload: {id_especie: number, fecha_avistamiento: string, latitud: number, longitud: number, notas?: string, nombre_usuario: string, email_usuario: string, nombre?: string, apellido_paterno?: string, apellido_materno?: string}`.
- Produces: `crearEvento(payload)` → same return shape. `payload: {titulo: string, descripcion: string, fecha_evento: string, hora_inicio: string, hora_fin: string, id_tipo_evento: number, id_modalidad: number, capacidad_maxima: number, costo: number, contacto: string}`.
- Produces: `getTiposEvento()` → `Promise<{success: boolean, tipos: Array<{id: number, nombre: string, descripcion: string}>}>`.
- Produces: `getModalidades()` → `Promise<{success: boolean, modalidades: Array<{id: number, nombre: string}>}>`.

- [ ] **Step 1: Add `crearAvistamiento` after `getAvistamientosMine` (currently ends at line 253)**

Insert immediately after the closing `}` of `getAvistamientosMine`:

```javascript
export async function crearAvistamiento(payload) {
  try {
    const res = await fetch(`${API_HOST}/api/reportar-avistamiento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'Error al reportar el avistamiento');
    return data;
  } catch (error) {
    console.error('Error en crearAvistamiento:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}
```

- [ ] **Step 2: Add `crearEvento`, `getTiposEvento`, `getModalidades` after `getEventos` (currently ends at line 264)**

Insert immediately after the closing `}` of `getEventos`:

```javascript
export async function crearEvento(payload) {
  try {
    const res = await fetch(`${API_HOST}/api/eventos/crear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'Error al crear el evento');
    return data;
  } catch (error) {
    console.error('Error en crearEvento:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function getTiposEvento() {
  try {
    const res = await fetch(`${API_HOST}/api/tipos-evento`);
    return await res.json();
  } catch (error) {
    console.error('Error en getTiposEvento:', error);
    return { success: false, tipos: [] };
  }
}

export async function getModalidades() {
  try {
    const res = await fetch(`${API_HOST}/api/modalidades`);
    return await res.json();
  } catch (error) {
    console.error('Error en getModalidades:', error);
    return { success: false, modalidades: [] };
  }
}
```

- [ ] **Step 3: Verify the backend is reachable and get real test data**

Run (adjust host/port if the backend runs in docker on a different port):

```bash
curl http://localhost:8000/api/tipos-evento
curl http://localhost:8000/api/modalidades
curl http://localhost:8000/api/especies?limit=1
```

Expected: all three return `200` with `{"success": true, ...}` and at least one item each. Note one `id` from `tipos-evento`, one from `modalidades`, and one `id` from `especies` — you'll reuse them in Step 4.

- [ ] **Step 4: Manually verify `reportar-avistamiento` end-to-end via curl**

Replace `<ID_ESPECIE>` with the id noted in Step 3:

```bash
curl -X POST http://localhost:8000/api/reportar-avistamiento \
  -H "Content-Type: application/json" \
  -d '{"id_especie": <ID_ESPECIE>, "fecha_avistamiento": "2026-07-30 10:00:00", "latitud": 20.5, "longitud": -105.2, "nombre_usuario": "Test Curl", "email_usuario": "test.curl.plan@example.com", "notas": "verificacion de plan"}'
```

Expected: `200` with `{"success": true, "message": "Avistamiento reportado exitosamente"}`. This confirms the payload shape the `crearAvistamiento` function sends matches what the backend expects — no code depends on this curl call, it's a manual contract check.

- [ ] **Step 5: Manually verify `eventos/crear` end-to-end via curl**

Replace `<ID_TIPO_EVENTO>` and `<ID_MODALIDAD>` with the ids noted in Step 3:

```bash
curl -X POST http://localhost:8000/api/eventos/crear \
  -H "Content-Type: application/json" \
  -d '{"titulo": "Evento de prueba plan", "descripcion": "Descripcion de prueba con al menos diez caracteres", "fecha_evento": "2026-08-15", "hora_inicio": "10:00", "hora_fin": "12:00", "id_tipo_evento": <ID_TIPO_EVENTO>, "id_modalidad": <ID_MODALIDAD>, "capacidad_maxima": 50, "costo": 0, "contacto": "test.curl.plan@example.com"}'
```

Expected: `200` with `{"success": true, "evento_id": <int>, "message": "Evento creado exitosamente. Será revisado y publicado pronto."}`. No `Authorization` header sent here on purpose — this confirms the guest fallback path still works; the mobile app will additionally send a Bearer token via `authHeaders()`, which the backend prefers over the guest path when present.

- [ ] **Step 6: Commit**

```bash
git add MockupsSwayMobile/src/api/client.js
git commit -m "feat: add avistamiento/evento create + catalog client functions"
```

---

### Task 2: Backend fix — `crear_evento` must recognize colaborador tokens

**Files:**
- Modify: `app/security/auth.py:61-71`
- Modify: `app/routers/eventos.py:9`, `app/routers/eventos.py:105`

**Interfaces:**
- Produces: `get_optional_organizador_user(credentials)` — a FastAPI dependency, drop-in replacement for `get_optional_tienda_user` at the one call site that uses it (`crear_evento`). Same return shape: the decoded JWT payload dict, or `None`.

**Root cause (confirmed via curl with a real login token during Task 1):** `crear_evento` (`app/routers/eventos.py:102`) depends on `get_optional_tienda_user` (`app/security/auth.py:61`), which only returns a payload when `token_type == "tienda"` (web2 shop-customer tokens). A colaborador's JWT (`token_type == "colaborador"`, same `sub`/user-id shape, see `app/routers/colaboradores.py:43-49`) is silently treated as absent, so `crear_evento` always falls into its guest-user-creation branch — which then crashes with `psycopg.errors.UniqueViolation` on `usuarios_email_key` because the colaborador's email already has a `Usuario` row. This is not fixable client-side; the mobile app always sends a colaborador Bearer token (Task 4), so this endpoint must recognize it.

**Scope note:** the guest branch's pre-existing lack of an email-dedup check (it doesn't look up an existing `Usuario` by email before inserting, unlike `reportar_avistamiento`) is a separate latent bug reachable by true guests (no token) resubmitting with a repeated email — out of scope for this fix, which only needs to unblock the always-authenticated mobile path. Do not fix the guest-path dedup as part of this task.

- [ ] **Step 1: Broaden the auth dependency to accept colaborador tokens**

In `app/security/auth.py`, find:

```python
def get_optional_tienda_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)):
    token = _extract_token(credentials)
    if not token:
        return None
    try:
        payload = decode_token(token)
        if payload.get("token_type") == "tienda":
            return payload
        return None
    except HTTPException:
        return None
```

Replace with:

```python
def get_optional_organizador_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)):
    token = _extract_token(credentials)
    if not token:
        return None
    try:
        payload = decode_token(token)
        if payload.get("token_type") in ("tienda", "colaborador"):
            return payload
        return None
    except HTTPException:
        return None
```

- [ ] **Step 2: Update the one call site**

In `app/routers/eventos.py`, find:

```python
from app.security.auth import get_optional_tienda_user
```

Replace with:

```python
from app.security.auth import get_optional_organizador_user
```

Find:

```python
    current_user: Optional[dict] = Depends(get_optional_tienda_user),
```

Replace with:

```python
    current_user: Optional[dict] = Depends(get_optional_organizador_user),
```

- [ ] **Step 3: Verify the fix against the live backend**

The backend runs in docker (`sway_api` container) and reloads on file change — if it doesn't pick up the change automatically, restart it (`docker restart sway_api`), then re-run:

```bash
curl -s -X POST http://localhost:8000/api/colaboradores/login -H "Content-Type: application/json" -d '{"email": "<a real colaborador email>", "password": "<its password>"}'
```

Extract `access_token` from the response, then:

```bash
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST http://localhost:8000/api/eventos/crear \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"titulo": "Evento verificacion fix auth", "descripcion": "Descripcion de prueba con al menos diez caracteres", "fecha_evento": "2026-08-20", "hora_inicio": "09:00", "hora_fin": "11:00", "id_tipo_evento": 1, "id_modalidad": 1, "capacidad_maxima": 30, "costo": 0, "contacto": "<the same email>"}'
```

Expected: `HTTP_STATUS:200` and `{"success": true, "evento_id": <int>, ...}` — no `UniqueViolation`, no `500`. Also confirm in `docker logs sway_api --tail 5` that no new `Usuario` row was created for this request (the organizer should resolve to the existing colaborador's `Organizador` row via `current_user["sub"]`, not the guest-creation branch).

Also re-run the plain guest curl from Task 1 Step 5 (no `Authorization` header) with a **fresh, never-used email** to confirm the guest path itself still works when it doesn't collide with an existing email:

```bash
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST http://localhost:8000/api/eventos/crear \
  -H "Content-Type: application/json" \
  -d '{"titulo": "Evento guest fresh email", "descripcion": "Descripcion de prueba con al menos diez caracteres", "fecha_evento": "2026-08-21", "hora_inicio": "09:00", "hora_fin": "11:00", "id_tipo_evento": 1, "id_modalidad": 1, "capacidad_maxima": 30, "costo": 0, "contacto": "guest.fresh.<timestamp>@example.com"}'
```

Expected: `HTTP_STATUS:200`, `{"success": true, ...}` — confirms this fix didn't touch the guest branch's happy path.

- [ ] **Step 4: Commit**

```bash
git add app/security/auth.py app/routers/eventos.py
git commit -m "fix: recognize colaborador JWTs in crear_evento's optional-auth dependency"
```

---

### Task 3: `SightingsScreen.js` — wire real submit, drop uncatalogued-species toggle

**Files:**
- Modify: `MockupsSwayMobile/src/screens/SightingsScreen.js`

**Interfaces:**
- Consumes: `crearAvistamiento(payload)`, `getProfile()` (existing, returns `{colaborador: {nombre, apellido_paterno, apellido_materno, email, ...}}`), `getAvistamientosMine()` (existing) — all from Task 1 / already in `client.js`.

- [ ] **Step 1: Import the new client functions**

In `MockupsSwayMobile/src/screens/SightingsScreen.js`, find:

```javascript
import { getAvistamientosMine } from '../api/client';
```

Replace with:

```javascript
import { getAvistamientosMine, getProfile, crearAvistamiento } from '../api/client';
```

- [ ] **Step 2: Drop `especieNoCatalogada` from the initial form state**

Find:

```javascript
const initialSightingForm = {
  especieId: null,
  especieNombre: '',
  especieNoCatalogada: false,
  fecha: '',
  latitud: '',
  longitud: '',
  notas: '',
  fotoUri: null,
};
```

Replace with:

```javascript
const initialSightingForm = {
  especieId: null,
  especieNombre: '',
  fecha: '',
  latitud: '',
  longitud: '',
  notas: '',
  fotoUri: null,
};
```

- [ ] **Step 3: Add colaborador-profile state and fetch it on mount**

Find the existing mount effect:

```javascript
  useEffect(() => {
    let active = true;
    getAvistamientosMine().then((data) => {
      if (!active) return;
      if (data?.avistamientos?.length) {
        setSightings(data.avistamientos.map(mapAvistamientoFromApi));
      }
    });
    return () => {
      active = false;
    };
  }, []);
```

Add a new state declaration right above it and a second effect right after it:

```javascript
  const [colaboradorProfile, setColaboradorProfile] = useState(null);

  useEffect(() => {
    let active = true;
    getAvistamientosMine().then((data) => {
      if (!active) return;
      if (data?.avistamientos?.length) {
        setSightings(data.avistamientos.map(mapAvistamientoFromApi));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getProfile().then((data) => {
      if (!active || !data?.colaborador) return;
      setColaboradorProfile(data.colaborador);
    });
    return () => {
      active = false;
    };
  }, []);
```

- [ ] **Step 4: Rewrite `handleReportSighting` to POST for real**

Find the whole function:

```javascript
  const handleReportSighting = () => {
    const especieNombre = sightingForm.especieNoCatalogada
      ? sightingForm.especieNombre.trim()
      : sightingForm.especieNombre;
    if (
      !especieNombre ||
      !sightingForm.fecha ||
      !sightingForm.latitud ||
      !sightingForm.longitud
    ) {
      Alert.alert('Datos incompletos', 'Completa todos los campos obligatorios.');
      return;
    }
    const lat = Number(sightingForm.latitud);
    const lon = Number(sightingForm.longitud);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      Alert.alert('Latitud inválida', 'La latitud debe ser un número entre -90 y 90.');
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      Alert.alert('Longitud inválida', 'La longitud debe ser un número entre -180 y 180.');
      return;
    }
    setSightings((prev) => [
      {
        id: String(Date.now()),
        species: especieNombre,
        reporter: '',
        date: sightingForm.fecha,
        location: `${sightingForm.latitud}, ${sightingForm.longitud}`,
        individuals: 1,
        status: 'PENDING',
        notes: sightingForm.notas,
        hasPhoto: !!sightingForm.fotoUri,
      },
      ...prev,
    ]);
    incrementSightings(false, !!sightingForm.fotoUri);
    bumpStreak();
    setSightingForm(initialSightingForm);
    setNewModal(false);
  };
```

Replace with:

```javascript
  const handleReportSighting = async () => {
    if (
      !sightingForm.especieId ||
      !sightingForm.especieNombre ||
      !sightingForm.fecha ||
      !sightingForm.latitud ||
      !sightingForm.longitud
    ) {
      Alert.alert('Datos incompletos', 'Completa todos los campos obligatorios.');
      return;
    }
    const lat = Number(sightingForm.latitud);
    const lon = Number(sightingForm.longitud);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      Alert.alert('Latitud inválida', 'La latitud debe ser un número entre -90 y 90.');
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      Alert.alert('Longitud inválida', 'La longitud debe ser un número entre -180 y 180.');
      return;
    }
    if (!colaboradorProfile?.email) {
      Alert.alert('Error', 'No se pudo obtener tu perfil. Intenta de nuevo.');
      return;
    }
    const nombreCompleto = [
      colaboradorProfile.nombre,
      colaboradorProfile.apellido_paterno,
      colaboradorProfile.apellido_materno,
    ].filter(Boolean).join(' ');
    const result = await crearAvistamiento({
      id_especie: sightingForm.especieId,
      fecha_avistamiento: sightingForm.fecha,
      latitud: lat,
      longitud: lon,
      notas: sightingForm.notas,
      nombre_usuario: nombreCompleto,
      email_usuario: colaboradorProfile.email,
      nombre: colaboradorProfile.nombre,
      apellido_paterno: colaboradorProfile.apellido_paterno,
      apellido_materno: colaboradorProfile.apellido_materno,
    });
    if (!result.success) {
      Alert.alert('Error', result.message || 'No se pudo reportar el avistamiento.');
      return;
    }
    const refreshed = await getAvistamientosMine();
    if (refreshed?.avistamientos) {
      setSightings(refreshed.avistamientos.map(mapAvistamientoFromApi));
    }
    incrementSightings(false, !!sightingForm.fotoUri);
    bumpStreak();
    setSightingForm(initialSightingForm);
    setNewModal(false);
  };
```

Note: `sightingForm.fecha` comes from `DateField` with `mode="datetime"`, which already produces `"YYYY-MM-DD HH:MM"` — a valid `datetime.fromisoformat()` input on the backend (any single separator character is accepted between date and time, seconds are optional). No reformatting needed.

- [ ] **Step 5: Remove the "especie no catalogada" chip and freeform input**

Find this whole block (species field, inside the new-sighting modal):

```javascript
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Especie observada *</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {speciesList.map((sp) => (
                    <TouchableOpacity
                      key={sp.id}
                      style={[
                        styles.chip,
                        !sightingForm.especieNoCatalogada &&
                          sightingForm.especieId === sp.id &&
                          styles.chipActive,
                      ]}
                      onPress={() =>
                        setSightingForm((prev) => ({
                          ...prev,
                          especieId: sp.id,
                          especieNombre: sp.commonName,
                          especieNoCatalogada: false,
                        }))
                      }
                    >
                      <Text
                        style={[
                          styles.chipText,
                          !sightingForm.especieNoCatalogada &&
                            sightingForm.especieId === sp.id &&
                            styles.chipTextActive,
                        ]}
                      >
                        {sp.commonName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[
                      styles.chip,
                      sightingForm.especieNoCatalogada && styles.chipActive,
                    ]}
                    onPress={() =>
                      setSightingForm((prev) => ({
                        ...prev,
                        especieId: null,
                        especieNombre: '',
                        especieNoCatalogada: true,
                      }))
                    }
                  >
                    <Text
                      style={[
                        styles.chipText,
                        sightingForm.especieNoCatalogada && styles.chipTextActive,
                      ]}
                    >
                      Especie no catalogada
                    </Text>
                  </TouchableOpacity>
                </ScrollView>

                {sightingForm.especieNoCatalogada && (
                  <TextInput
                    style={[styles.formInput, { marginTop: 10 }]}
                    placeholder="Nombre de la especie observada"
                    placeholderTextColor={colors.text3}
                    value={sightingForm.especieNombre}
                    onChangeText={(v) => setField('especieNombre', v)}
                  />
                )}
              </View>
```

Replace with:

```javascript
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Especie observada *</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {speciesList.map((sp) => (
                    <TouchableOpacity
                      key={sp.id}
                      style={[
                        styles.chip,
                        sightingForm.especieId === sp.id && styles.chipActive,
                      ]}
                      onPress={() =>
                        setSightingForm((prev) => ({
                          ...prev,
                          especieId: sp.id,
                          especieNombre: sp.commonName,
                        }))
                      }
                    >
                      <Text
                        style={[
                          styles.chipText,
                          sightingForm.especieId === sp.id && styles.chipTextActive,
                        ]}
                      >
                        {sp.commonName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
```

- [ ] **Step 6: Manually verify the screen still renders and the flow works**

Run the Expo dev server (`npx expo start` from `MockupsSwayMobile/`), open Sightings, open "new sighting" modal, confirm: no "especie no catalogada" chip appears, picking a species + date + lat/lon + submitting shows either success (modal closes, list refreshes) or a backend error alert — not a crash. This is a manual UI smoke check; no Expo simulator is available in this environment, so this step is executed by whoever has a device/simulator, same gap already logged in `progress.md` for other mobile features.

- [ ] **Step 7: Commit**

```bash
git add MockupsSwayMobile/src/screens/SightingsScreen.js
git commit -m "feat: wire real avistamiento POST, drop uncatalogued-species option"
```

---

### Task 4: `EventsScreen.js` — wire real submit, catalog-backed chips

**Files:**
- Modify: `MockupsSwayMobile/src/screens/EventsScreen.js`

**Interfaces:**
- Consumes: `crearEvento(payload)`, `getTiposEvento()`, `getModalidades()` (from Task 1), `getEventos()` (existing).

- [ ] **Step 1: Import the new client functions and drop the hardcoded catalogs**

Find:

```javascript
import { getEventos } from '../api/client';
```

Replace with:

```javascript
import { getEventos, getTiposEvento, getModalidades, crearEvento } from '../api/client';
```

Find:

```javascript
const TIPOS_EVENTO = [
  'Conferencia',
  'Taller',
  'Limpieza de Playa',
  'Seminario',
  'Expedición',
  'Campaña de Concientización',
  'Capacitación',
  'Festival',
];

const MODALIDADES = ['Presencial', 'Virtual', 'Híbrida', 'Webinar', 'Taller Práctico'];
```

Delete both — the new catalogs come from the API and live in component state (Step 3), these constants become unused once the chip render is updated in Step 5.

- [ ] **Step 2: Switch `tipo`/`modalidad` in the form state to catalog ids**

Find:

```javascript
const initialEventForm = {
  titulo: '',
  tipo: '',
  fecha: '',
  capacidadMaxima: '',
  modalidad: '',
  ubicacion: '',
  descripcion: '',
  horaInicio: '',
  horaFin: '',
  costo: '',
  contacto: '',
  terminos: false,
};
```

Replace with:

```javascript
const initialEventForm = {
  titulo: '',
  tipoId: null,
  fecha: '',
  capacidadMaxima: '',
  modalidadId: null,
  ubicacion: '',
  descripcion: '',
  horaInicio: '',
  horaFin: '',
  costo: '',
  contacto: '',
  terminos: false,
};
```

- [ ] **Step 3: Fetch the catalogs on mount**

Find the existing mount effect:

```javascript
  useEffect(() => {
    let active = true;
    getEventos().then((data) => {
      if (!active) return;
      if (data?.eventos?.length) {
        setEvents(data.eventos.map(mapEventoFromApi));
      }
    });
    return () => {
      active = false;
    };
  }, []);
```

Add new state right above it and a second effect right after it:

```javascript
  const [tiposEvento, setTiposEvento] = useState([]);
  const [modalidades, setModalidades] = useState([]);

  useEffect(() => {
    let active = true;
    getEventos().then((data) => {
      if (!active) return;
      if (data?.eventos?.length) {
        setEvents(data.eventos.map(mapEventoFromApi));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getTiposEvento().then((data) => {
      if (active && data?.tipos) setTiposEvento(data.tipos);
    });
    getModalidades().then((data) => {
      if (active && data?.modalidades) setModalidades(data.modalidades);
    });
    return () => {
      active = false;
    };
  }, []);
```

- [ ] **Step 4: Rewrite `handleCreateEvent` to POST for real**

Find:

```javascript
  const handleCreateEvent = () => {
    if (
      !eventForm.titulo ||
      !eventForm.tipo ||
      !eventForm.fecha ||
      !eventForm.capacidadMaxima ||
      !eventForm.modalidad ||
      !eventForm.descripcion ||
      !eventForm.horaInicio ||
      !eventForm.horaFin ||
      !eventForm.contacto
    ) {
```

Replace the two catalog-field checks (keep everything else in this `if` identical):

```javascript
  const handleCreateEvent = async () => {
    if (
      !eventForm.titulo ||
      !eventForm.tipoId ||
      !eventForm.fecha ||
      !eventForm.capacidadMaxima ||
      !eventForm.modalidadId ||
      !eventForm.descripcion ||
      !eventForm.horaInicio ||
      !eventForm.horaFin ||
      !eventForm.contacto
    ) {
```

Then find the tail of the same function:

```javascript
    setEvents((prev) => [
      {
        id: String(Date.now()),
        name: eventForm.titulo,
        location: eventForm.ubicacion || eventForm.modalidad,
        time: `${eventForm.horaInicio} - ${eventForm.horaFin}`,
        date: eventForm.fecha,
        participants: 0,
        maxParticipants: Number(eventForm.capacidadMaxima) || 0,
        status: 'UPCOMING',
        organizer: eventForm.contacto,
        description: eventForm.descripcion,
      },
      ...prev,
    ]);
    bumpStreak();
    setEventForm(initialEventForm);
    setNewModal(false);
    Alert.alert('Propuesta enviada', 'Tu evento será revisado antes de su publicación.');
  };
```

Replace with:

```javascript
    const descripcionFinal = eventForm.ubicacion.trim()
      ? `${eventForm.descripcion}\n\nUbicación: ${eventForm.ubicacion.trim()}`
      : eventForm.descripcion;

    const result = await crearEvento({
      titulo: eventForm.titulo,
      descripcion: descripcionFinal,
      fecha_evento: eventForm.fecha,
      hora_inicio: eventForm.horaInicio,
      hora_fin: eventForm.horaFin,
      id_tipo_evento: eventForm.tipoId,
      id_modalidad: eventForm.modalidadId,
      capacidad_maxima: Number(eventForm.capacidadMaxima),
      costo,
      contacto: eventForm.contacto,
    });
    if (!result.success) {
      Alert.alert('Error', result.message || 'No se pudo enviar la propuesta de evento.');
      return;
    }
    const refreshed = await getEventos();
    if (refreshed?.eventos) {
      setEvents(refreshed.eventos.map(mapEventoFromApi));
    }
    bumpStreak();
    setEventForm(initialEventForm);
    setNewModal(false);
    Alert.alert('Propuesta enviada', 'Tu evento será revisado antes de su publicación.');
  };
```

`costo` is the already-validated `const costo = Number(eventForm.costo);` declared earlier in this same function — no new variable needed, it's in scope.

- [ ] **Step 5: Render chips from the fetched catalogs instead of the hardcoded arrays**

Find:

```javascript
                  {TIPOS_EVENTO.map((tipo) => (
                    <TouchableOpacity
                      key={tipo}
                      style={[styles.chip, eventForm.tipo === tipo && styles.chipActive]}
                      onPress={() => setField('tipo', tipo)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          eventForm.tipo === tipo && styles.chipTextActive,
                        ]}
                      >
                        {tipo}
                      </Text>
                    </TouchableOpacity>
                  ))}
```

Replace with:

```javascript
                  {tiposEvento.map((tipo) => (
                    <TouchableOpacity
                      key={tipo.id}
                      style={[styles.chip, eventForm.tipoId === tipo.id && styles.chipActive]}
                      onPress={() => setField('tipoId', tipo.id)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          eventForm.tipoId === tipo.id && styles.chipTextActive,
                        ]}
                      >
                        {tipo.nombre}
                      </Text>
                    </TouchableOpacity>
                  ))}
```

Find:

```javascript
                  {MODALIDADES.map((mod) => (
                    <TouchableOpacity
                      key={mod}
                      style={[styles.chip, eventForm.modalidad === mod && styles.chipActive]}
                      onPress={() => setField('modalidad', mod)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          eventForm.modalidad === mod && styles.chipTextActive,
                        ]}
                      >
                        {mod}
                      </Text>
                    </TouchableOpacity>
                  ))}
```

Replace with:

```javascript
                  {modalidades.map((mod) => (
                    <TouchableOpacity
                      key={mod.id}
                      style={[styles.chip, eventForm.modalidadId === mod.id && styles.chipActive]}
                      onPress={() => setField('modalidadId', mod.id)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          eventForm.modalidadId === mod.id && styles.chipTextActive,
                        ]}
                      >
                        {mod.nombre}
                      </Text>
                    </TouchableOpacity>
                  ))}
```

- [ ] **Step 6: Manually verify the screen still renders and the flow works**

Run the Expo dev server, open Events, open "propose event" modal, confirm: tipo/modalidad chips populate from the live backend (not the old hardcoded 8/5 options — compare counts against the `curl` results from Task 1 Step 3), filling the form and submitting shows either success (modal closes, list refreshes) or a backend error alert. Same manual-only caveat as Task 2 Step 6 — no simulator in this environment.

- [ ] **Step 7: Commit**

```bash
git add MockupsSwayMobile/src/screens/EventsScreen.js
git commit -m "feat: wire real evento POST, catalog-backed tipo/modalidad chips"
```

---

### Task 5: Update `progress.md`

**Files:**
- Modify: `progress.md`

- [ ] **Step 1: Mark pendiente #4 resolved**

In the "Pendientes cruzados" section, find point 4 (starts with `**Avistamientos y Eventos: el submit no existe...`) and strike it the same way points #6/#7/#9 were struck (`~~...~~` + `✅ **RESUELTO 2026-07-30**`), with a one-line pointer to this plan and the fact that no backend changes were needed since both endpoints already existed.

- [ ] **Step 2: Commit**

```bash
git add progress.md
git commit -m "docs: mark pendiente #4 (avistamientos/eventos POST) resolved"
```
