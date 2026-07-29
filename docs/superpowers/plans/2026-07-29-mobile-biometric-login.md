# Mobile Biometric Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile app's existing "Iniciar sesión con biometría" button actually resume a real colaborador session (stored JWT, revalidated against the backend) instead of being a no-op that logs any fingerprint in as whoever last used the app.

**Architecture:** An opt-in AsyncStorage flag (`sway_biometric_enabled`) gates a new boot-time path in `LoginScreen.js`: if the flag is set and a token is stored, show a biometric-only unlock panel instead of the password form; on successful device biometric + a `getProfile()` revalidation call, resume the session. The JWT itself moves from plaintext `AsyncStorage` to `expo-secure-store` so the biometric gate protects something actually encrypted at rest.

**Tech Stack:** React Native (Expo 54), `expo-local-authentication` (already installed), `expo-secure-store` (new), existing `MockupsSwayMobile/src/api/client.js` fetch-based API client.

## Global Constraints

- No test framework exists in this repo (mockup app, no Jest config) — verification is Babel parse-check (matches every prior mobile plan in this repo) plus manual `npx expo start` verification.
- Spec: `docs/superpowers/specs/2026-07-29-mobile-biometric-login-design.md`.
- Server-side face recognition (`face_service.py`, `FirmaBiometrica` audit signing) is untouched — out of scope.
- The `sway_biometric_enabled` flag is device-local UI state only; never sent to the backend.
- On any biometric/revalidation failure: clear the stored token only, leave the `sway_biometric_enabled` flag untouched, fall back to the password form.

---

### Task 1: Migrate stored JWT from AsyncStorage to expo-secure-store

**Files:**
- Modify: `MockupsSwayMobile/package.json` (new dependency)
- Modify: `MockupsSwayMobile/src/api/client.js:1,11-49`

**Interfaces:**
- Consumes: nothing new.
- Produces: `authHeaders()`, `login()`, `logout()` keep their existing signatures and return shapes — Task 4 (LoginScreen) calls `login()` exactly as it does today, no changes needed on the caller side.

- [ ] **Step 1: Install expo-secure-store**

Run: `cd "MockupsSwayMobile" && npx expo install expo-secure-store`
Expected: `package.json` gains `"expo-secure-store": "~<version>"` in dependencies; command exits 0.

- [ ] **Step 2: Replace AsyncStorage calls for TOKEN_KEY with SecureStore**

In `MockupsSwayMobile/src/api/client.js`, replace the top of the file (import line 1, and the `TOKEN_KEY`/`authHeaders`/`buildErrorResult`/`login`/`logout` block currently at lines 11-49) with:

```javascript
import * as SecureStore from 'expo-secure-store';
```

(Remove the `import AsyncStorage from '@react-native-async-storage/async-storage';` line — nothing else in this file uses `AsyncStorage` after this change.)

```javascript
const TOKEN_KEY = 'sway_colab_token';

async function authHeaders() {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function buildErrorResult(res, data, fallback) {
  if (res.status === 401) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return { success: false, sessionExpired: true, message: 'Sesión expirada, inicia sesión de nuevo.' };
  }
  return { success: false, message: typeof data.detail === 'string' ? data.detail : fallback };
}

export async function login(email, password) {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok && data.access_token) {
      await SecureStore.setItemAsync(TOKEN_KEY, data.access_token);
      return { success: true };
    }
    return { success: false, message: data.detail || data.message || 'Credenciales inválidas' };
  } catch (error) {
    console.error('Error en login:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function logout() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function hasStoredToken() {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  return !!token;
}
```

(`hasStoredToken()` is new — Task 4's boot check needs to know whether a token exists without leaking the token value into `LoginScreen.js`.)

- [ ] **Step 3: Parse-check the file**

Run: `cd "MockupsSwayMobile" && node -e "const babel=require('@babel/core');const preset=require('@babel/preset-react');babel.transformFileSync('src/api/client.js',{presets:[preset]});console.log('OK')"`
Expected: `OK`

- [ ] **Step 4: Manual verification**

Run `npx expo start`, log in with a real colaborador account. Expected: login still succeeds (now backed by SecureStore instead of AsyncStorage). Open any screen that calls an authenticated endpoint (e.g. Catálogo). Expected: no 401/sessionExpired regression.

- [ ] **Step 5: Commit**

```bash
git add "MockupsSwayMobile/package.json" "MockupsSwayMobile/package-lock.json" "MockupsSwayMobile/src/api/client.js"
git commit -m "feat: move mobile session token from AsyncStorage to expo-secure-store"
```

---

### Task 2: Add biometric-login-enabled flag helpers to the API client

**Files:**
- Modify: `MockupsSwayMobile/src/api/client.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `isBiometricLoginEnabled(): Promise<boolean>`
  - `setBiometricLoginEnabled(enabled: boolean): Promise<void>`
  - Both consumed by Task 3 (`ProfileScreen.js`) and Task 4 (`LoginScreen.js`).

- [ ] **Step 1: Add the flag helpers**

In `MockupsSwayMobile/src/api/client.js`, add `AsyncStorage` back as an import (this flag is not a secret, so it stays in plain AsyncStorage per the spec) and add the two functions near `hasStoredToken()`:

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
```

```javascript
const BIOMETRIC_FLAG_KEY = 'sway_biometric_enabled';

export async function isBiometricLoginEnabled() {
  return (await AsyncStorage.getItem(BIOMETRIC_FLAG_KEY)) === 'true';
}

export async function setBiometricLoginEnabled(enabled) {
  if (enabled) {
    await AsyncStorage.setItem(BIOMETRIC_FLAG_KEY, 'true');
  } else {
    await AsyncStorage.removeItem(BIOMETRIC_FLAG_KEY);
  }
}
```

- [ ] **Step 2: Parse-check the file**

Run: `cd "MockupsSwayMobile" && node -e "const babel=require('@babel/core');const preset=require('@babel/preset-react');babel.transformFileSync('src/api/client.js',{presets:[preset]});console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add "MockupsSwayMobile/src/api/client.js"
git commit -m "feat: add biometric-login-enabled flag helpers to mobile api client"
```

---

### Task 3: Add the "Acceso biométrico" toggle to ProfileScreen's Seguridad tab

**Files:**
- Modify: `MockupsSwayMobile/src/screens/ProfileScreen.js`

**Interfaces:**
- Consumes: `isBiometricLoginEnabled`, `setBiometricLoginEnabled` from Task 2 (`import { ..., isBiometricLoginEnabled, setBiometricLoginEnabled } from '../api/client';`); `LocalAuthentication.hasHardwareAsync()` / `isEnrolledAsync()` from `expo-local-authentication` (already a dependency, already used in `LoginScreen.js`).
- Produces: nothing consumed by later tasks — this task is a leaf. Reuses existing `styles.notifPrefRow` / `styles.notifPrefInfo` / `styles.notifPrefLabel` / `styles.notifPrefDesc` (already defined for the notification-preferences `Switch` list at `ProfileScreen.js:539-555`) — no new styles needed.

- [ ] **Step 1: Import LocalAuthentication and the new client functions**

At the top of `ProfileScreen.js`, add:

```javascript
import * as LocalAuthentication from 'expo-local-authentication';
```

Update the existing `../api/client` import to also pull in `isBiometricLoginEnabled, setBiometricLoginEnabled`.

- [ ] **Step 2: Add state and a load-on-mount effect**

Next to the existing `const [saving, setSaving] = useState(false);`, add:

```javascript
const [biometricEnabled, setBiometricEnabled] = useState(false);
```

Add a new `useEffect` (alongside the existing ones near the top of the component body):

```javascript
useEffect(() => {
  let active = true;
  isBiometricLoginEnabled().then((v) => {
    if (active) setBiometricEnabled(v);
  });
  return () => {
    active = false;
  };
}, []);
```

- [ ] **Step 3: Add the toggle handler**

```javascript
const handleToggleBiometric = async (value) => {
  if (value) {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    if (!hasHardware || !isEnrolled) {
      Alert.alert(
        'Biometría no disponible',
        'Este dispositivo no tiene huella o Face ID configurado.',
      );
      return;
    }
  }
  await setBiometricLoginEnabled(value);
  setBiometricEnabled(value);
};
```

- [ ] **Step 4: Render the toggle in the Seguridad tab**

In `ProfileScreen.js`, find the Seguridad tab block (`{activeTab === 'security' && (` at line 814, closing at line 856). Add the toggle row right after the closing `</View>` of the "Confirmar contraseña" field block and before the `<TouchableOpacity style={styles.saveBtn} ...>` (i.e., right after line 851's `</View>`, before line 852):

```javascript
            <View style={styles.notifPrefRow}>
              <View style={styles.notifPrefInfo}>
                <Text style={styles.notifPrefLabel}>Acceso biométrico</Text>
                <Text style={styles.notifPrefDesc}>
                  Usa tu huella o Face ID para reabrir tu sesión sin escribir tu contraseña.
                </Text>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleToggleBiometric}
                trackColor={{ false: colors.borderMid, true: colors.blueLight }}
                thumbColor={biometricEnabled ? colors.blue : colors.text3}
              />
            </View>

```

- [ ] **Step 5: Parse-check the file**

Run: `cd "MockupsSwayMobile" && node -e "const babel=require('@babel/core');const preset=require('@babel/preset-react');babel.transformFileSync('src/screens/ProfileScreen.js',{presets:[preset]});console.log('OK')"`
Expected: `OK`

- [ ] **Step 6: Manual verification**

`npx expo start` on an emulator/device with a fingerprint enrolled. Log in, go to Perfil → Seguridad. Expected: new "Acceso biométrico" row appears below the password fields, toggle starts off. Turn it on. Expected: no alert (hardware present), toggle stays on. Force-quit and reopen the app, go back to Perfil → Seguridad. Expected: toggle still shows on (flag persisted).

- [ ] **Step 7: Commit**

```bash
git add "MockupsSwayMobile/src/screens/ProfileScreen.js"
git commit -m "feat: add biometric login toggle to ProfileScreen Seguridad tab"
```

---

### Task 4: Wire LoginScreen to unlock the stored session via biometrics

**Files:**
- Modify: `MockupsSwayMobile/src/screens/LoginScreen.js`

**Interfaces:**
- Consumes: `hasStoredToken` from Task 1, `isBiometricLoginEnabled` from Task 2 (both from `../api/client`), and `getProfile` (already exists in `../api/client`, already returns `{ success, colaborador }` or `{ success: false, colaborador: null }` on network failure — no `sessionExpired` field today, so this task checks `result.success` directly rather than relying on that flag).
- Produces: nothing consumed by later tasks — this task is a leaf.

- [ ] **Step 1: Import the new client functions and getProfile**

Update the existing `import { login as apiLogin } from '../api/client';` line to:

```javascript
import { login as apiLogin, getProfile, hasStoredToken, isBiometricLoginEnabled, logout } from '../api/client';
```

- [ ] **Step 2: Add boot-time state for the biometric-only unlock panel**

Next to the existing `const [biometricAvailable, setBiometricAvailable] = useState(false);`, add:

```javascript
const [showBiometricUnlock, setShowBiometricUnlock] = useState(false);
const [checkingSession, setCheckingSession] = useState(true);
```

- [ ] **Step 3: Replace the existing hardware-check effect with one that also checks the flag and stored token**

Replace the current effect:

```javascript
useEffect(() => {
  let active = true;
  (async () => {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    if (active) setBiometricAvailable(hasHardware && isEnrolled);
  })();
  return () => {
    active = false;
  };
}, []);
```

with:

```javascript
useEffect(() => {
  let active = true;
  (async () => {
    const [hasHardware, isEnrolled, biometricEnabled, tokenPresent] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      isBiometricLoginEnabled(),
      hasStoredToken(),
    ]);
    if (!active) return;
    setBiometricAvailable(hasHardware && isEnrolled);
    setShowBiometricUnlock(hasHardware && isEnrolled && biometricEnabled && tokenPresent);
    setCheckingSession(false);
  })();
  return () => {
    active = false;
  };
}, []);
```

- [ ] **Step 4: Rewrite handleBiometric to revalidate the stored session**

Replace the current `handleBiometric`:

```javascript
const handleBiometric = async () => {
  setError('');
  setLoading(true);
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Confirma tu identidad para acceder a SWAY',
    cancelLabel: 'Cancelar',
  });
  setLoading(false);
  if (result.success) {
    if (onLogin) onLogin();
  } else if (result.error && result.error !== 'user_cancel') {
    setError('No se pudo verificar tu identidad');
  }
};
```

with:

```javascript
const handleBiometric = async () => {
  setError('');
  setLoading(true);
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Confirma tu identidad para acceder a SWAY',
    cancelLabel: 'Cancelar',
  });
  if (!result.success) {
    setLoading(false);
    if (result.error && result.error !== 'user_cancel') {
      setError('No se pudo verificar tu identidad');
    }
    return;
  }
  const profile = await getProfile();
  setLoading(false);
  if (profile.success) {
    if (onLogin) onLogin();
    return;
  }
  await logout();
  setShowBiometricUnlock(false);
  setError('Tu sesión expiró, inicia sesión de nuevo.');
};
```

- [ ] **Step 5: Add a manual fallback link and gate the form behind `showBiometricUnlock`**

In the JSX, wrap the existing `<View style={styles.formCard}>` contents so that when `showBiometricUnlock` is true, only a compact unlock panel renders. Find the opening `<View style={styles.formCard}>` (around where `styles.title` and `styles.subtitle` currently render, before `{error ? (...) : null}`) and change the render to branch on `showBiometricUnlock`:

```javascript
<View style={styles.formCard}>
  {checkingSession ? (
    <ActivityIndicator color={colors.blue} size="small" />
  ) : showBiometricUnlock ? (
    <>
      <Text style={styles.title}>Bienvenido de nuevo</Text>
      <Text style={styles.subtitle}>Usa tu huella o Face ID para continuar</Text>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.biometricBtn}
        onPress={handleBiometric}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color={colors.blue} size="small" />
        ) : (
          <>
            <Ionicons name="finger-print-outline" size={18} color={colors.blue} />
            <Text style={styles.biometricText}>Iniciar sesión con biometría</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.switchBtn}
        onPress={() => {
          setShowBiometricUnlock(false);
          setError('');
        }}
      >
        <Text style={styles.switchText}>Usar contraseña</Text>
      </TouchableOpacity>
    </>
  ) : (
    <>
      {/* existing title/subtitle/error/form/submit/divider/biometricBtn/switchBtn JSX stays exactly as-is here */}
    </>
  )}
</View>
```

The comment marks where all of the current `formCard` JSX (from `<Text style={styles.title}>` through the closing `</TouchableOpacity>` of `switchBtn`, i.e. today's lines 170-465) moves unchanged into the new `else` branch — no line inside that block changes.

- [ ] **Step 6: Parse-check the file**

Run: `cd "MockupsSwayMobile" && node -e "const babel=require('@babel/core');const preset=require('@babel/preset-react');babel.transformFileSync('src/screens/LoginScreen.js',{presets:[preset]});console.log('OK')"`
Expected: `OK`

- [ ] **Step 7: Manual verification**

With the Task 3 toggle already enabled from a prior login: force-quit and reopen the app. Expected: LoginScreen briefly shows a spinner (`checkingSession`), then shows only the biometric unlock panel (no password fields). Trigger the fingerprint successfully. Expected: `getProfile()` runs, app proceeds to Inicio.

Cancel or fail the fingerprint prompt. Expected: stays on the biometric panel, no crash, can retry.

Tap "Usar contraseña". Expected: switches to the normal password form without needing a failed fingerprint attempt.

To test the expired-token path: after enabling the toggle, manually invalidate the token (e.g. change the backend `SECRET_KEY` temporarily, or wait out token expiry) then reopen the app and trigger biometric. Expected: `getProfile()` fails, token is cleared, "Tu sesión expiró" error shows, then tapping the fingerprint button again (or "Usar contraseña") leads to the normal password form since `hasStoredToken()` will be false on next boot.

Disable the toggle from Perfil → Seguridad, force-quit and reopen. Expected: normal password form shows immediately (no biometric panel, `checkingSession` resolves to `showBiometricUnlock = false`).

- [ ] **Step 8: Commit**

```bash
git add "MockupsSwayMobile/src/screens/LoginScreen.js"
git commit -m "feat: unlock stored session via biometrics on mobile login"
```

---

## Self-Review

**Spec coverage:** Task 1 covers the SecureStore migration (spec section 4). Task 2 covers the `sway_biometric_enabled` flag storage (spec section 1, storage half). Task 3 covers the Perfil → Seguridad toggle UI (spec section 1, UI half). Task 4 covers LoginScreen boot behavior (spec section 2) and the biometric unlock flow including revalidation and fallback (spec section 3). Every spec section maps to a task.

**Placeholder scan:** One intentional exception — Task 4 Step 5 says "existing JSX stays exactly as-is" instead of repeating ~300 lines of unchanged registration-form JSX verbatim; this is a structural move (wrap existing block in a branch), not new logic, so nothing about *what to write* is left undefined. Every other step has literal code.

**Type consistency:** `hasStoredToken()` (Task 1) → `boolean`, consumed by Task 4's boot effect as `tokenPresent`. `isBiometricLoginEnabled()`/`setBiometricLoginEnabled(bool)` (Task 2) → consumed identically by both Task 3 (`biometricEnabled` state) and Task 4 (`biometricEnabled` local var in the boot effect) with matching names and types.
