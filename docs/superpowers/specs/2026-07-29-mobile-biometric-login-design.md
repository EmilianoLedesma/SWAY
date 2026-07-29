# Mobile Biometric Login — Design

**Date:** 2026-07-29
**Scope:** `MockupsSwayMobile` (Expo/React Native) only. Backend/web server-side face recognition (`face_service.py`, `FirmaBiometrica` audit signing) is untouched — separate system, out of scope.

## Problem

`LoginScreen.js` already shows a "Iniciar sesión con biometría" button (`biometricAvailable` state, `handleBiometric`) whenever the device has fingerprint/FaceID hardware enrolled. Today that button is a decoy: on successful OS-level prompt it just calls `onLogin()` directly — no token, no colaborador identity, no backend call at all. Meanwhile a real JWT is already persisted on every password login (`client.js` `TOKEN_KEY = 'sway_colab_token'`, written in `login()`), but nothing reads it back on app start — `AuthContext`'s `isLoggedIn` always initializes to `false` (`AuthContext.js:6`), so the stored token currently goes unused after the app is killed and reopened.

Goal: make the biometric button actually unlock the existing stored session for that specific colaborador, instead of being a no-op identity bypass.

## Design

### 1. Opt-in toggle (Perfil → Seguridad)

New `Switch` "Acceso biométrico" in `ProfileScreen.js`'s Seguridad tab. State persisted as a new AsyncStorage boolean flag, `sway_biometric_enabled` (separate key from the token).

- Enabling: re-check `LocalAuthentication.hasHardwareAsync()` + `isEnrolledAsync()` (same pair already used in `LoginScreen.js:61-65`); if both true, set the flag. If either is false, show an alert explaining the device has no biometric enrolled and leave the toggle off.
- Disabling: remove the flag. No password re-confirmation needed — this happens inside an already-authenticated session.
- The flag is device-local only; it is not sent to or stored by the backend. It only controls mobile UI behavior.

### 2. LoginScreen boot behavior

On mount, in addition to the existing hardware check, also read the `sway_biometric_enabled` flag and check whether a token is present in storage (`AsyncStorage.getItem(TOKEN_KEY)`).

- If flag is set AND a token exists: render only the biometric button (skip the password form) as the primary path.
- Otherwise: current behavior (password form; biometric button hidden, as today) — this preserves the existing first-login and toggle-disabled paths unchanged.

### 3. Biometric unlock flow (`handleBiometric` rewrite)

1. `LocalAuthentication.authenticateAsync({ promptMessage: ... })` — unchanged prompt.
2. On success: call `getProfile()` (already exists in `client.js`, already used by other screens to detect an expired/invalid session via a `sessionExpired` flag in its result) using the stored token. This confirms the token hasn't expired or been revoked server-side since the phone was last unlocked.
3. If `getProfile()` succeeds: `onLogin()` — session resumes as the colaborador the token belongs to.
4. If biometric prompt fails/is cancelled, OR `getProfile()` reports the session expired/invalid: clear the stored token only (`AsyncStorage.removeItem(TOKEN_KEY)`), leave the `sway_biometric_enabled` flag untouched, and fall back to rendering the normal password form. The user logs in again with password; if they do, and the flag is still set, the very next password `login()` should also refresh the token in storage, so biometric unlock will work again on the next app open without needing to revisit the toggle.

No new backend endpoint is needed — `getProfile()` already exists and already round-trips through `authHeaders()`/the stored Bearer token.

### 4. Token storage hardening (recommended, included in this spec)

Current `TOKEN_KEY` storage is plain `AsyncStorage` (`client.js:11,37`) — unencrypted, readable directly off device storage (e.g. via adb backup/root access) regardless of any biometric gate placed in front of it in the UI. Gating access to a plaintext-readable token with a fingerprint prompt is cosmetic unless the token itself is protected at rest.

Migrate `TOKEN_KEY` reads/writes in `client.js` from `AsyncStorage` to `expo-secure-store` (`SecureStore.getItemAsync` / `setItemAsync` / `deleteItemAsync`), which backs onto the OS Keychain (iOS) / Keystore (Android). API shape is a drop-in match for the existing `AsyncStorage` calls (same 3 call sites: `authHeaders()`, `login()`, `logout()`). No other storage keys change — `sway_biometric_enabled` stays in plain `AsyncStorage` since it holds no secret, just a UI preference.

`expo-secure-store` is already Expo Go SDK 54-compatible (no prebuild required), consistent with how `@react-native-community/datetimepicker` was added in the prior session.

## Out of Scope

- Server-side face recognition / `FirmaBiometrica` audit signing (web CRUD signing) — already working, untouched.
- Any change to the login-face (1:N face identification) or enroll-face Flask endpoints.
- Multi-account / multiple stored tokens on one device — single active session assumed, matching current app behavior.

## Testing (manual, no test framework in this repo)

1. Password login → Perfil → Seguridad → enable "Acceso biométrico" on an emulator/device with a fingerprint enrolled. Expected: flag set, no error.
2. Kill and reopen the app. Expected: LoginScreen shows only the biometric button, no password form.
3. Successful fingerprint → expected: lands on Inicio, `getProfile()` call visible in network/logs, no password re-entry.
4. Cancel or fail the fingerprint prompt → expected: falls back to password form; toggle remains enabled for next attempt.
5. Manually invalidate the token server-side (or edit stored value to garbage) then retry biometric → expected: `getProfile()` fails, token cleared, password form shown.
6. Disable the toggle from Seguridad → kill/reopen app → expected: normal password form shown, no biometric button attempted.
