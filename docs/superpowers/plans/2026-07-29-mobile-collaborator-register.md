# Mobile Collaborator Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the mobile app's collaborator register form (already built in `LoginScreen.js`) to real backend validation and the real `/api/colaboradores/register` endpoint, mirroring web1's actual enforced JS rules (`templates/especies.html`), with two approved deviations: `numero_cedula` stays required on mobile, and successful registration auto-logs the user in.

**Architecture:** Extract the register-form's accreditation-field validation (name/años/cédula/ORCID/motivación/terms) into a small pure, dependency-free CommonJS module so it's independently testable with plain `node` (no test framework exists in this Expo project, so no framework gets introduced). Add four new fetch wrappers to the existing `client.js` following its established `buildErrorResult` pattern. Rewrite `LoginScreen.js`'s `handleSubmit` register branch to: validate locally → check duplicates (email/cédula/orcid) in parallel → POST register → auto-login.

**Tech Stack:** React Native (Expo), plain CommonJS module for validation logic, Node's built-in `assert` for the self-check (no Jest/testing-library added).

## Global Constraints

- No changes to `app/routers/colaboradores.py` or `app/models/colaboradores.py` — backend contract is fixed and already correct.
- No email-sending logic added on the client — `send_welcome_email` stays a server-side `BackgroundTask`, untouched.
- `numero_cedula` is required on mobile (deviates from web1, which treats it as optional) — approved deviation, do not "fix" it to optional.
- `nombre` sent to the register endpoint must be the plain first-name field only — do NOT concatenate apellidoPaterno/apellidoMaterno into it (web1 does this; it's a pre-existing bug in `templates/especies.html`, not to be mirrored).
- Do not add Jest, React Native Testing Library, or any new dependency — this project has zero test infrastructure today and none of this work needs a framework.

---

### Task 1: Pure validation helpers module + self-check

**Files:**
- Create: `MockupsSwayMobile/src/utils/collaboratorValidation.js`
- Test: `MockupsSwayMobile/src/utils/collaboratorValidation.test.js`

**Interfaces:**
- Produces: `validateNombre(value, label) -> string|null`, `validateApellidoMaterno(value) -> string|null`, `validateAniosExperiencia(value) -> string|null`, `validateCedula(value) -> string|null`, `validateOrcid(value) -> string|null`, `validateMotivacion(value) -> string|null`, `validateRegisterForm(fields) -> string|null` where `fields` is `{ nombre, apellidoPaterno, apellidoMaterno, especialidad, gradoAcademico, institucion, aniosExperiencia, numeroCedula, orcid, motivacion, termsAccepted }`. All exported via `module.exports` (CommonJS, no RN imports, so plain `node` can run the test file and Metro/Babel can `import` it from `LoginScreen.js`).

- [ ] **Step 1: Write the module**

```javascript
// MockupsSwayMobile/src/utils/collaboratorValidation.js
// Pure validation for the collaborator register form's accreditation fields.
// Mirrors the rules actually enforced by templates/especies.html's collaborator
// modal JS (validateRegisterForm), not its HTML minlength/required attributes,
// several of which are dead markup there.

const NOMBRE_RE = /^[A-Za-zÀ-ÿ\s]{2,50}$/;
const CEDULA_RE = /^\d{7,8}$/;
const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

function validateNombre(value, label) {
  if (!value || !value.trim()) return `${label} es obligatorio`;
  if (!NOMBRE_RE.test(value.trim())) return `${label} debe tener 2-50 letras`;
  return null;
}

function validateApellidoMaterno(value) {
  if (!value || !value.trim()) return null;
  if (!NOMBRE_RE.test(value.trim())) return 'Apellido materno debe tener 2-50 letras';
  return null;
}

function validateAniosExperiencia(value) {
  if (!value || !value.trim()) return 'Los años de experiencia son obligatorios';
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0 || n > 100) {
    return 'Los años de experiencia deben ser un número entre 0 y 100';
  }
  return null;
}

function validateCedula(value) {
  if (!value || !value.trim()) return 'El número de cédula profesional es obligatorio';
  if (!CEDULA_RE.test(value.trim())) return 'Formato de cédula profesional inválido (7-8 dígitos)';
  return null;
}

function validateOrcid(value) {
  if (!value || !value.trim()) return null;
  if (!ORCID_RE.test(value.trim())) return 'El ORCID debe tener el formato 0000-0000-0000-0000';
  return null;
}

function validateMotivacion(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return 'La motivación para colaborar es obligatoria';
  if (trimmed.length < 50) return 'Cuéntanos tu motivación en al menos 50 caracteres';
  if (trimmed.length > 500) return 'La motivación no puede exceder 500 caracteres';
  return null;
}

function validateRegisterForm(fields) {
  const {
    nombre, apellidoPaterno, apellidoMaterno, especialidad, gradoAcademico,
    institucion, aniosExperiencia, numeroCedula, orcid, motivacion, termsAccepted,
  } = fields;

  const nombreError = validateNombre(nombre, 'El nombre');
  if (nombreError) return nombreError;

  const apellidoPaternoError = validateNombre(apellidoPaterno, 'El apellido paterno');
  if (apellidoPaternoError) return apellidoPaternoError;

  const apellidoMaternoError = validateApellidoMaterno(apellidoMaterno);
  if (apellidoMaternoError) return apellidoMaternoError;

  if (!especialidad || !gradoAcademico || !institucion) {
    return 'Completa todos los campos obligatorios';
  }

  const aniosError = validateAniosExperiencia(aniosExperiencia);
  if (aniosError) return aniosError;

  const cedulaError = validateCedula(numeroCedula);
  if (cedulaError) return cedulaError;

  const orcidError = validateOrcid(orcid);
  if (orcidError) return orcidError;

  const motivacionError = validateMotivacion(motivacion);
  if (motivacionError) return motivacionError;

  if (!termsAccepted) {
    return 'Debes aceptar los términos para colaboradores científicos';
  }

  return null;
}

module.exports = {
  validateNombre,
  validateApellidoMaterno,
  validateAniosExperiencia,
  validateCedula,
  validateOrcid,
  validateMotivacion,
  validateRegisterForm,
};
```

- [ ] **Step 2: Write the self-check (plain assert, no framework)**

```javascript
// MockupsSwayMobile/src/utils/collaboratorValidation.test.js
const assert = require('assert');
const {
  validateNombre, validateApellidoMaterno, validateAniosExperiencia,
  validateCedula, validateOrcid, validateMotivacion, validateRegisterForm,
} = require('./collaboratorValidation');

assert.strictEqual(validateNombre('Ana', 'El nombre'), null);
assert.strictEqual(validateNombre('', 'El nombre'), 'El nombre es obligatorio');
assert.strictEqual(validateNombre('A', 'El nombre'), 'El nombre debe tener 2-50 letras');

assert.strictEqual(validateApellidoMaterno(''), null);
assert.strictEqual(validateApellidoMaterno('García'), null);
assert.strictEqual(validateApellidoMaterno('G'), 'Apellido materno debe tener 2-50 letras');

assert.strictEqual(validateAniosExperiencia('5'), null);
assert.strictEqual(validateAniosExperiencia('0'), null);
assert.strictEqual(validateAniosExperiencia('100'), null);
assert.strictEqual(validateAniosExperiencia('101'), 'Los años de experiencia deben ser un número entre 0 y 100');
assert.strictEqual(validateAniosExperiencia('-1'), 'Los años de experiencia deben ser un número entre 0 y 100');
assert.strictEqual(validateAniosExperiencia(''), 'Los años de experiencia son obligatorios');
assert.strictEqual(validateAniosExperiencia('abc'), 'Los años de experiencia deben ser un número entre 0 y 100');

assert.strictEqual(validateCedula('1234567'), null);
assert.strictEqual(validateCedula('12345678'), null);
assert.strictEqual(validateCedula(''), 'El número de cédula profesional es obligatorio');
assert.strictEqual(validateCedula('123'), 'Formato de cédula profesional inválido (7-8 dígitos)');

assert.strictEqual(validateOrcid(''), null);
assert.strictEqual(validateOrcid('0000-0002-1825-0097'), null);
assert.strictEqual(validateOrcid('bad-orcid'), 'El ORCID debe tener el formato 0000-0000-0000-0000');

assert.strictEqual(validateMotivacion('x'.repeat(50)), null);
assert.strictEqual(validateMotivacion('short'), 'Cuéntanos tu motivación en al menos 50 caracteres');
assert.strictEqual(validateMotivacion('x'.repeat(501)), 'La motivación no puede exceder 500 caracteres');
assert.strictEqual(validateMotivacion(''), 'La motivación para colaborar es obligatoria');

const validFields = {
  nombre: 'Ana', apellidoPaterno: 'García', apellidoMaterno: '',
  especialidad: 'biologia-marina', gradoAcademico: 'maestria',
  institucion: 'UPQ', aniosExperiencia: '5', numeroCedula: '1234567',
  orcid: '', motivacion: 'x'.repeat(60), termsAccepted: true,
};
assert.strictEqual(validateRegisterForm(validFields), null);

assert.strictEqual(
  validateRegisterForm({ ...validFields, termsAccepted: false }),
  'Debes aceptar los términos para colaboradores científicos'
);

assert.strictEqual(
  validateRegisterForm({ ...validFields, numeroCedula: '123' }),
  'Formato de cédula profesional inválido (7-8 dígitos)'
);

console.log('collaboratorValidation: all assertions passed');
```

- [ ] **Step 3: Run it to verify it passes**

Run: `node MockupsSwayMobile/src/utils/collaboratorValidation.test.js`
Expected: prints `collaboratorValidation: all assertions passed` and exits 0. If any `assert.strictEqual` fails, Node prints an `AssertionError` with actual vs expected — fix the module, not the test.

- [ ] **Step 4: Commit**

```bash
git add MockupsSwayMobile/src/utils/collaboratorValidation.js MockupsSwayMobile/src/utils/collaboratorValidation.test.js
git commit -m "feat: add pure validation helpers for collaborator register form"
```

---

### Task 2: API client functions for register + duplicate checks

**Files:**
- Modify: `MockupsSwayMobile/src/api/client.js:28-45` (insert new functions right after the existing `login` function, before `logout`)

**Interfaces:**
- Consumes: existing `API_HOST` constant, existing `buildErrorResult(res, data, fallback)` (defined at `client.js:18-24`).
- Produces: `registerColaborador(payload) -> Promise<{success, message?, colaborador_id?, user_id?}>`, `checkEmail(email) -> Promise<{exists, can_register, message?}>`, `checkOrcid(orcid) -> Promise<{exists, can_register, message?}>`, `checkCedula(cedula) -> Promise<{exists, can_register, message?}>`.

- [ ] **Step 1: Add the four functions**

Insert immediately after the closing brace of the existing `login` function (`client.js:45`, right before `export async function logout()`):

```javascript
export async function registerColaborador(payload) {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'Error al registrar colaborador');
    return data;
  } catch (error) {
    console.error('Error en registerColaborador:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function checkEmail(email) {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/check-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return await res.json();
  } catch (error) {
    console.error('Error en checkEmail:', error);
    return { exists: false, can_register: true };
  }
}

export async function checkOrcid(orcid) {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/check-orcid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orcid }),
    });
    return await res.json();
  } catch (error) {
    console.error('Error en checkOrcid:', error);
    return { exists: false, can_register: true };
  }
}

export async function checkCedula(cedula) {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/check-cedula`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cedula }),
    });
    return await res.json();
  } catch (error) {
    console.error('Error en checkCedula:', error);
    return { exists: false, can_register: true };
  }
}
```

Note: `checkEmail`/`checkOrcid`/`checkCedula` return `{ exists: false, can_register: true }` on network failure — this matches the fail-open behavior of web1's own `catch` blocks in `templates/especies.html` (lines ~2420, 2438, 2456), so a flaky connection doesn't block registration on a check that isn't the source of truth (the register endpoint itself is).

- [ ] **Step 2: Verify by reading the diff**

Run: `git diff MockupsSwayMobile/src/api/client.js`
Expected: four new exported functions only, no changes to existing functions. These are thin fetch wrappers following the exact pattern already used by `createEspecie`/`updateEspecie` — trivial one-liners per-function, no dedicated test needed (per project convention: no test framework exists, and this task carries no new branching logic beyond what Task 1 already covers).

- [ ] **Step 3: Commit**

```bash
git add MockupsSwayMobile/src/api/client.js
git commit -m "feat: add registerColaborador and duplicate-check API client functions"
```

---

### Task 3: Wire LoginScreen's register submit to real validation + API

**Files:**
- Modify: `MockupsSwayMobile/src/screens/LoginScreen.js:16` (import line)
- Modify: `MockupsSwayMobile/src/screens/LoginScreen.js:87-147` (`handleSubmit`)

**Interfaces:**
- Consumes: `validateRegisterForm` from Task 1 (`../utils/collaboratorValidation`), `registerColaborador`/`checkEmail`/`checkOrcid`/`checkCedula` from Task 2 (`../api/client`), existing `login as apiLogin` (already imported), existing component state (`email, password, name, apellidoPaterno, apellidoMaterno, confirmPassword, especialidad, gradoAcademico, institucion, aniosExperiencia, numeroCedula, orcid, motivacion, termsAccepted, isLogin, loading, error`).
- Produces: nothing new consumed by later tasks — this is the last code task.

- [ ] **Step 1: Update the import line**

Replace `LoginScreen.js:16`:

```javascript
import { login as apiLogin } from '../api/client';
```

with:

```javascript
import { login as apiLogin, registerColaborador, checkEmail, checkOrcid, checkCedula } from '../api/client';
import { validateRegisterForm } from '../utils/collaboratorValidation';
```

- [ ] **Step 2: Replace `handleSubmit` (lines 87-147)**

Replace the entire existing `handleSubmit` function with:

```javascript
  const handleSubmit = async () => {
    setError('');
    if (!email || !password) {
      setError('Completa todos los campos');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Ingresa un correo electrónico válido');
      return;
    }
    if (!isLogin) {
      if (password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres');
        return;
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden');
        return;
      }
      const registerError = validateRegisterForm({
        nombre: name,
        apellidoPaterno,
        apellidoMaterno,
        especialidad,
        gradoAcademico,
        institucion,
        aniosExperiencia,
        numeroCedula,
        orcid,
        motivacion,
        termsAccepted,
      });
      if (registerError) {
        setError(registerError);
        return;
      }
    }

    setLoading(true);

    if (isLogin) {
      const result = await apiLogin(email, password);
      setLoading(false);
      if (result.success) {
        if (onLogin) onLogin();
      } else {
        setError(result.message);
      }
      return;
    }

    const [emailCheck, cedulaCheck, orcidCheck] = await Promise.all([
      checkEmail(email),
      checkCedula(numeroCedula),
      orcid.trim() ? checkOrcid(orcid) : Promise.resolve({ exists: false, can_register: true }),
    ]);
    const duplicate = [emailCheck, cedulaCheck, orcidCheck].find(
      (check) => check.exists && !check.can_register
    );
    if (duplicate) {
      setError(duplicate.message || 'Ya existe una solicitud con estos datos');
      setLoading(false);
      return;
    }

    const registerResult = await registerColaborador({
      nombre: name,
      apellidoPaterno,
      apellidoMaterno,
      email,
      password,
      especialidad,
      grado_academico: gradoAcademico,
      institucion,
      años_experiencia: aniosExperiencia,
      numero_cedula: numeroCedula,
      orcid,
      motivacion,
    });

    if (!registerResult.success) {
      setError(registerResult.message || 'No se pudo completar el registro');
      setLoading(false);
      return;
    }

    const loginResult = await apiLogin(email, password);
    setLoading(false);
    if (loginResult.success) {
      if (onLogin) onLogin();
    } else {
      setError(loginResult.message);
    }
  };
```

- [ ] **Step 3: Verify by reading the diff**

Run: `git diff MockupsSwayMobile/src/screens/LoginScreen.js`
Expected: only the import line and `handleSubmit` changed; no JSX/styling touched. Confirm `nombre: name` is sent plain (not concatenated with apellidos) and `numero_cedula`/`años_experiencia`/`grado_academico` use the exact snake_case keys the Pydantic `ColaboradorRegister` model expects (`app/models/colaboradores.py:19-79`).

- [ ] **Step 4: Commit**

```bash
git add MockupsSwayMobile/src/screens/LoginScreen.js
git commit -m "feat: wire collaborator register form to real backend validation and API"
```

---

### Task 4: Manual end-to-end verification

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Start the backend**

Run: `uvicorn app.main:app --reload` (or the project's existing documented backend start command) from the repo root.

- [ ] **Step 2: Start the Expo app**

Run: `cd MockupsSwayMobile && npm start` (or `expo start`), open on a device/simulator on the same network as the backend.

- [ ] **Step 3: Walk the golden path**

On the login screen, tap "¿No tienes cuenta? Regístrate", fill every field with valid values (nombre 2+ letters, apellido paterno 2+ letters, valid email not already registered, password 6+ chars matching confirm, pick especialidad/grado chips, institución text, años de experiencia 0-100, número de cédula 7-8 digits, motivación 50+ chars, accept terms), submit.
Expected: no error banner appears, the app navigates past login (auto-login succeeded) — confirm in the backend logs or DB that a new `Usuarios`/`Colaboradores` row was created with `estado_solicitud = 'aprobada'`.

- [ ] **Step 4: Walk the duplicate-email edge case**

Repeat the same registration with the same email just used.
Expected: error banner shows the backend's duplicate message (e.g. "Ya eres un colaborador activo" or the check-email endpoint's message), no duplicate row created.

- [ ] **Step 5: Walk a validation edge case**

Try submitting with años de experiencia = `150` (out of range) and with número de cédula = `123` (wrong format).
Expected: error banner shows the corresponding Spanish message from `collaboratorValidation.js` before any network call is made (check that no request appears in backend logs for these two attempts).

- [ ] **Step 6: Record the result**

No commit needed for this task — it's manual verification only. If any step fails, return to Task 3 and fix before considering the plan done.
