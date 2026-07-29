# Mobile CRUD Wiring (Especies + Perfil) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the mobile app's Catálogo and Perfil screens to the real backend CRUD endpoints, using only the endpoints web2 already calls successfully (verified live) — not endpoints that merely exist in the backend router but are unused by any working client.

**Architecture:** `MockupsSwayMobile/src/api/client.js` gains thin wrapper functions mirroring `web2/src/api/client.js`'s `api.*` methods 1:1 (same HTTP verb, same path, same payload shape). Each screen's existing local-state handlers (`handleSave`, `handleDelete`, `handleSavePersonal`, etc.) are modified in place to call these functions instead of only mutating React state, then re-sync from the server response.

**Tech Stack:** React Native (Expo 54), fetch-based API client, FastAPI backend on `http://<lan-ip>:8000`.

## Global Constraints

- Only wire endpoints confirmed present in BOTH `app/routers/*.py` (backend) AND `web2/src/api/client.js` (proof the contract actually works end-to-end): `POST/PUT/DELETE /api/especies`, `PUT /api/colaboradores/perfil`, `PUT /api/colaboradores/perfil/password`, `DELETE /api/colaboradores/perfil`.
- Do NOT wire `POST /api/eventos/crear` or `POST /api/reportar-avistamiento` in this plan — backend has these routes but web2's `api.js` never calls them, so they are unverified from a live-client perspective. Out of scope; flag to user separately if they want a second plan for those.
- `nombre_comun` / `nombre_cientifico` require `min_length=2` server-side (`app/models/especies.py:9-18,56-65`) — client-side validation must reject single-character input before submit to avoid a 422.
- `id_estado_conservacion` is required (`ge=1`) on both create and update (`app/models/especies.py:32-35`) — already enforced in `CatalogScreen.js` (`handleSave` checks `!form.idEstadoConservacion`).
- All especies + perfil endpoints require `Authorization: Bearer <token>` from `get_current_colaborador` — reuse the existing `authHeaders()` helper in `MockupsSwayMobile/src/api/client.js`.
- Backend base for manual verification during this plan: `http://127.0.0.1:8000` (confirmed reachable and DB-backed earlier this session).

---

## File Structure

- **Modify:** `MockupsSwayMobile/src/api/client.js` — add `createEspecie`, `updateEspecie`, `deleteEspecie`, `updatePerfil`, `changePassword`, `deletePerfil`.
- **Modify:** `MockupsSwayMobile/src/screens/CatalogScreen.js` — `handleSave` and `handleDelete` call the new especie functions; add `saving` state for the submit button.
- **Modify:** `MockupsSwayMobile/src/screens/ProfileScreen.js` — `handleSavePersonal`, `handleSaveProfesional`, `handleChangePassword`, `handleDeactivate` call the new perfil functions.

No new files. No test framework exists in this repo (mockup app, no Jest config) — verification is done by calling the live FastAPI server directly (PowerShell `Invoke-RestMethod`) before and after each wiring step, matching how this session already validated `/api/eventos` and `/api/especies` reachability.

---

### Task 1: Add especie + perfil CRUD functions to mobile API client

**Files:**
- Modify: `MockupsSwayMobile/src/api/client.js`

**Interfaces:**
- Consumes: existing `API_HOST` const, existing `authHeaders()` function (both already defined in this file).
- Produces:
  - `createEspecie(payload): Promise<{success: bool, especie_id: number, message: string}>`
  - `updateEspecie(id: string|number, payload): Promise<{success: bool, message: string}>`
  - `deleteEspecie(id: string|number): Promise<{success: bool, message: string}>`
  - `updatePerfil(payload): Promise<{success: bool, message: string}>`
  - `changePassword(payload: {password_actual: string, password_nuevo: string}): Promise<{success: bool, message: string}>`
  - `deletePerfil(): Promise<{success: bool, message: string}>`

  `payload` for especies matches the object already built in `CatalogScreen.js handleSave` merge step: `{ nombre_comun, nombre_cientifico, descripcion, esperanza_vida, poblacion_estimada, id_estado_conservacion, imagen_url, amenazas, habitats }` (see Task 2 for the exact mapping since current form state uses camelCase keys that must be translated).

  `payload` for perfil matches `ColaboradorPerfilUpdate` (`app/models/colaboradores.py:105-120`): `{ nombre, apellido_paterno, apellido_materno, telefono, fecha_nacimiento, especialidad, grado_academico, institucion, años_experiencia, numero_cedula, orcid, motivacion }` — all strings, all optional (empty string = "no change" server-side).

- [ ] **Step 1: Add the six functions**

Open `MockupsSwayMobile/src/api/client.js`. After the existing `login`/`logout` functions and before `getProfile`, add:

```javascript
export async function createEspecie(payload) {
  try {
    const res = await fetch(`${API_HOST}/api/especies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Error al crear especie' };
    return data;
  } catch (error) {
    console.error('Error en createEspecie:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function updateEspecie(id, payload) {
  try {
    const res = await fetch(`${API_HOST}/api/especies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Error al actualizar especie' };
    return data;
  } catch (error) {
    console.error('Error en updateEspecie:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function deleteEspecie(id) {
  try {
    const res = await fetch(`${API_HOST}/api/especies/${id}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Error al eliminar especie' };
    return data;
  } catch (error) {
    console.error('Error en deleteEspecie:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function updatePerfil(payload) {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/perfil`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Error al actualizar perfil' };
    return data;
  } catch (error) {
    console.error('Error en updatePerfil:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function changePassword(payload) {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/perfil/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Error al cambiar contraseña' };
    return data;
  } catch (error) {
    console.error('Error en changePassword:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function deletePerfil() {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/perfil`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Error al desactivar cuenta' };
    return data;
  } catch (error) {
    console.error('Error en deletePerfil:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}
```

- [ ] **Step 2: Parse-check the file**

Run: `cd "MockupsSwayMobile" && node -e "const babel=require('@babel/core');const preset=require('@babel/preset-react');babel.transformFileSync('src/api/client.js',{presets:[preset]});console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Verify against the live backend with a throwaway curl-equivalent (no mobile app needed yet)**

Run (PowerShell, adjust IP if it changed):
```powershell
$token = (Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/colaboradores/login" -Method Post -ContentType "application/json" -Body '{"email":"<a real colaborador email>","password":"<real password>"}').access_token
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/especies" -Method Post -Headers @{Authorization="Bearer $token"} -ContentType "application/json" -Body '{"nombre_comun":"Test Especie","nombre_cientifico":"Testus testus","id_estado_conservacion":1}'
```
Expected: `{success: True, especie_id: <number>, message: "Especie creada correctamente"}` — confirms the exact payload shape Task 1's functions send will be accepted by the live server. If this 422s, fix the payload shape before moving to Task 2.

- [ ] **Step 4: Clean up the test row**

Run: `Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/especies/<especie_id from step 3>" -Method Delete -Headers @{Authorization="Bearer $token"}`
Expected: `{success: True, ...}`

- [ ] **Step 5: Commit**

```bash
git add "MockupsSwayMobile/src/api/client.js"
git commit -m "feat: add especie and perfil CRUD functions to mobile api client"
```

---

### Task 2: Wire CatalogScreen create/update/delete to the live API

**Files:**
- Modify: `MockupsSwayMobile/src/screens/CatalogScreen.js`

**Interfaces:**
- Consumes: `createEspecie`, `updateEspecie`, `deleteEspecie` from Task 1 (`import { ..., createEspecie, updateEspecie, deleteEspecie } from '../api/client';`).
- Produces: nothing consumed by later tasks — this task is a leaf.

- [ ] **Step 1: Add `saving` state and import the new functions**

In `CatalogScreen.js`, update the import block:

```javascript
import {
  getEspecies,
  getEstadosConservacion,
  getAmenazas,
  getHabitats,
  createEspecie,
  updateEspecie,
  deleteEspecie,
} from '../api/client';
```

Add next to the existing `const [loadingApi, setLoadingApi] = useState(true);`:

```javascript
const [saving, setSaving] = useState(false);
```

- [ ] **Step 2: Replace `handleSave` to call the API**

Find the current `handleSave` (ends with `setFormVisible(false);`). Replace its body from the `const merged = {...}` line onward:

```javascript
const handleSave = async () => {
  if (!form.commonName.trim() || !form.scientificName.trim()) {
    Alert.alert(
      'Datos incompletos',
      'El nombre común y el nombre científico son obligatorios.',
    );
    return;
  }
  if (form.commonName.trim().length < 2 || form.scientificName.trim().length < 2) {
    Alert.alert('Datos incompletos', 'Los nombres deben tener al menos 2 caracteres.');
    return;
  }
  if (!form.idEstadoConservacion) {
    Alert.alert('Datos incompletos', 'Selecciona un estado de conservación.');
    return;
  }
  const payload = {
    nombre_comun: form.commonName.trim(),
    nombre_cientifico: form.scientificName.trim(),
    descripcion: form.description || '',
    esperanza_vida: form.esperanzaVida !== '' ? Number(form.esperanzaVida) : null,
    poblacion_estimada: form.poblacionEstimada !== '' ? Number(form.poblacionEstimada) : null,
    id_estado_conservacion: Number(form.idEstadoConservacion),
    imagen_url: form.imagenUrl || '',
    amenazas: form.amenazaIds,
    habitats: form.habitatIds,
  };
  setSaving(true);
  const result = editId
    ? await updateEspecie(editId, payload)
    : await createEspecie(payload);
  setSaving(false);
  if (!result.success) {
    Alert.alert('Error', result.message || 'No se pudo guardar la especie.');
    return;
  }
  const estadoNombre = estadosCatalog.find(
    (e) => e.id === form.idEstadoConservacion,
  )?.nombre;
  const status =
    ESTADO_NOMBRE_TO_STATUS[estadoNombre?.toLowerCase()] || 'LEAST_CONCERN';
  const habitat = habitatsCatalog
    .filter((h) => form.habitatIds.includes(h.id))
    .map((h) => h.nombre)
    .join(', ');
  const merged = {
    ...form,
    status,
    habitat,
    population: form.poblacionEstimada !== '' ? String(form.poblacionEstimada) : '—',
    image: form.imagenUrl || null,
  };
  if (editId) {
    setSpecies((prev) => prev.map((s) => (s.id === editId ? { ...s, ...merged } : s)));
  } else {
    const newId = result.especie_id != null ? String(result.especie_id) : String(Date.now());
    setSpecies((prev) => [{ ...merged, id: newId }, ...prev]);
    incrementSpecies();
  }
  setFormVisible(false);
};
```

- [ ] **Step 3: Replace `handleDelete` to call the API**

```javascript
const handleDelete = (item) => {
  Alert.alert(
    'Eliminar especie',
    `¿Eliminar "${item.commonName}"? Esta acción no se puede deshacer.`,
    [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const result = await deleteEspecie(item.id);
          if (!result.success) {
            Alert.alert('Error', result.message || 'No se pudo eliminar la especie.');
            return;
          }
          setSelectedSpecies(null);
          setSpecies((prev) => prev.filter((s) => s.id !== item.id));
        },
      },
    ],
  );
};
```

- [ ] **Step 4: Show saving state on the submit button**

Find the "Guardar" `TouchableOpacity` in the form modal footer:

```javascript
<TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
  <Ionicons name="checkmark" size={18} color="#fff" />
  <Text style={styles.saveText}>{saving ? 'Guardando…' : 'Guardar'}</Text>
</TouchableOpacity>
```

- [ ] **Step 5: Parse-check the file**

Run: `cd "MockupsSwayMobile" && node -e "const babel=require('@babel/core');const preset=require('@babel/preset-react');babel.transformFileSync('src/screens/CatalogScreen.js',{presets:[preset]});console.log('OK')"`
Expected: `OK`

- [ ] **Step 6: Manual verification on device/emulator**

Start Expo (`npx expo start`), log in as a real colaborador, open Catálogo, tap "Nueva especie", fill required fields (nombre común, nombre científico, estado de conservación), save.
Expected: modal closes, new card appears in the grid, no error alert.
Then verify server-side: `Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/especies?limit=1" | ConvertTo-Json -Depth 4` and confirm the new species is present (or query by name).
Then edit that same species (change description), save — expected: no error, change reflected in the detail modal.
Then delete it — expected: card disappears, and a follow-up GET no longer lists it.

- [ ] **Step 7: Commit**

```bash
git add "MockupsSwayMobile/src/screens/CatalogScreen.js"
git commit -m "feat: wire especie create/update/delete to live API in CatalogScreen"
```

---

### Task 3: Wire ProfileScreen save/password/deactivate to the live API

**Files:**
- Modify: `MockupsSwayMobile/src/screens/ProfileScreen.js`

**Interfaces:**
- Consumes: `updatePerfil`, `changePassword`, `deletePerfil` from Task 1 (`import { getProfile, logout, updatePerfil, changePassword, deletePerfil } from '../api/client';`). Also consumes existing `logout` import (already wired from a prior session change).
- Produces: nothing consumed by later tasks — this task is a leaf.

- [ ] **Step 1: Import the new functions**

```javascript
import { getProfile, logout, updatePerfil, changePassword, deletePerfil } from '../api/client';
```

- [ ] **Step 2: Replace `handleSavePersonal` and `handleSaveProfesional`**

Both tabs write to the same backend endpoint (`PUT /api/colaboradores/perfil` accepts all fields from both tabs at once — see `app/routers/colaboradores.py:339-388`). Replace:

```javascript
const handleSavePersonal = async () => {
  const result = await updatePerfil({
    nombre: personal.nombre || '',
    apellido_paterno: personal.apellidoPaterno || '',
    apellido_materno: personal.apellidoMaterno || '',
    telefono: personal.telefono || '',
    fecha_nacimiento: personal.fechaNacimiento || '',
  });
  if (!result.success) {
    Alert.alert('Error', result.message || 'No se pudo actualizar el perfil.');
    return;
  }
  setEditingPersonal(false);
};

const handleSaveProfesional = async () => {
  const result = await updatePerfil({
    especialidad: profesional.especialidad || '',
    grado_academico: profesional.gradoAcademico || '',
    institucion: profesional.institucion || '',
    años_experiencia: profesional.aniosExperiencia || '',
    numero_cedula: profesional.numeroCedula || '',
    orcid: profesional.orcid || '',
    motivacion: profesional.motivacion || '',
  });
  if (!result.success) {
    Alert.alert('Error', result.message || 'No se pudo actualizar el perfil.');
    return;
  }
  setEditingProfesional(false);
};
```

- [ ] **Step 3: Replace `handleChangePassword`**

Keep the existing client-side validation (all fields present, match, min length), replace only the final block:

```javascript
const handleChangePassword = async () => {
  if (!pwForm.actual || !pwForm.nueva) {
    Alert.alert('Datos incompletos', 'Completa todos los campos.');
    return;
  }
  if (pwForm.nueva !== pwForm.confirmar) {
    Alert.alert('Error', 'Las contraseñas nuevas no coinciden.');
    return;
  }
  if (pwForm.nueva.length < 6) {
    Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres.');
    return;
  }
  const result = await changePassword({
    password_actual: pwForm.actual,
    password_nuevo: pwForm.nueva,
  });
  if (!result.success) {
    Alert.alert('Error', result.message || 'No se pudo actualizar la contraseña.');
    return;
  }
  setPwForm({ actual: '', nueva: '', confirmar: '' });
  Alert.alert('Contraseña actualizada', 'Vuelve a iniciar sesión.');
};
```

- [ ] **Step 4: Replace `handleDeactivate`**

```javascript
const handleDeactivate = async () => {
  setConfirmDeactivate(false);
  const result = await deletePerfil();
  if (!result.success) {
    Alert.alert('Error', result.message || 'No se pudo desactivar la cuenta.');
    return;
  }
  await logout();
  Alert.alert('Cuenta desactivada', 'Tu cuenta de colaborador fue desactivada.');
  setIsLoggedIn(false);
};
```

- [ ] **Step 5: Parse-check the file**

Run: `cd "MockupsSwayMobile" && node -e "const babel=require('@babel/core');const preset=require('@babel/preset-react');babel.transformFileSync('src/screens/ProfileScreen.js',{presets:[preset]});console.log('OK')"`
Expected: `OK`

- [ ] **Step 6: Manual verification on device/emulator**

Log in, go to Perfil → Personal tab, edit "Teléfono", save. Expected: no error alert, tab returns to read mode.
Verify server-side: `Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/colaboradores/profile" -Headers @{Authorization="Bearer $token"}` shows the new `telefono` value.
Go to Seguridad tab, attempt a password change with a deliberately wrong "contraseña actual" — expected: error alert "La contraseña actual es incorrecta" (from backend, not client-side — confirms the request actually reached the server).
Do NOT run the real deactivate flow against a live account you need — verify `deletePerfil()` wiring by reading the code path only, or test against a disposable test colaborador account if one exists.

- [ ] **Step 7: Commit**

```bash
git add "MockupsSwayMobile/src/screens/ProfileScreen.js"
git commit -m "feat: wire perfil update, password change, and deactivate to live API"
```

---

## Self-Review

**Spec coverage:** especies create/update/delete (Task 2), perfil update/password/delete (Task 3), shared client functions (Task 1) — matches every endpoint web2 proves working. Avistamientos/eventos explicitly excluded per Global Constraints since web2 never calls those backend routes.

**Placeholder scan:** no TBD/TODO; every step has literal code and literal verification commands with expected output.

**Type consistency:** `createEspecie`/`updateEspecie`/`deleteEspecie`/`updatePerfil`/`changePassword`/`deletePerfil` signatures in Task 1 match exactly how Task 2 and Task 3 call them (same argument names and order).
