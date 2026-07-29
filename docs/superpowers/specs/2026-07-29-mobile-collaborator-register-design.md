# Mobile collaborator register — design spec

**Date:** 2026-07-29
**Scope:** `MockupsSwayMobile/src/screens/LoginScreen.js` (register branch), `MockupsSwayMobile/src/api/client.js`

## Problem

`LoginScreen.js` already has a full register form UI mirroring web1's collaborator
fields, but the submit handler is fake — it never validates duplicate email/ORCID/cédula
and never calls the backend. It just `setTimeout`s and logs the user in.

Backend contract already exists and is untouched by this change:
- `app/routers/colaboradores.py`: `POST /api/colaboradores/register`, `POST /check-email`,
  `POST /check-orcid`, `POST /check-cedula`
- `app/models/colaboradores.py`: `ColaboradorRegister` Pydantic model

Web1's real validation source of truth is `templates/especies.html` (collaborator modal,
lines ~1797-2749) — its inline `<script>` block, not the HTML `minlength`/`required`
attributes, which are partly dead markup (e.g. cédula/ORCID show `*` but the JS treats
them as optional-format-checked-if-present).

No client-side email-sending step exists to replicate — the backend already fires
`send_welcome_email` as a `BackgroundTask` inside `/register`; mobile does nothing extra
for that.

## Client validation rules

Mirrors web1's actual enforced JS (`templates/especies.html` `validateRegisterForm`),
with one deliberate deviation (numero_cedula required) and range-check parity fixes:

| Field | Rule | Note |
|---|---|---|
| nombre | required, 2-50 chars, letters only | mobile currently allows 100 — trim to 50 |
| apellidoPaterno | required, 2-50 chars, letters only | same trim |
| apellidoMaterno | optional, 2-50 chars if present | same trim |
| email | required, valid format | unchanged |
| password | required, min 6 | unchanged (matches web1's real JS min, not the dead `minlength=8` HTML attr) |
| confirmPassword | must equal password | unchanged |
| especialidad | required (chip select) | unchanged |
| grado_academico | required (chip select) | unchanged |
| institucion | required | unchanged |
| años_experiencia | required, numeric, 0-100 | mobile currently only checks truthy — add range check |
| numero_cedula | **required** (deviates from web1, which treats it as optional) | add format check `/^\d{7,8}$/` |
| orcid | optional; if present, `/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/` | unchanged, already correct |
| motivacion | required, 50-500 chars | unchanged, already matches web1 exactly |
| termsAccepted | required, client-only, not sent to API | unchanged |

## Submit flow

1. Run local validation above, in order, stop on first failure (existing pattern in
   `handleSubmit`).
2. Call `checkEmail(email)`, `checkCedula(numeroCedula)`, and — only if `orcid` is
   filled — `checkOrcid(orcid)`, in parallel (`Promise.all`). If any response has
   `exists === true && can_register === false`, show that response's `message` in the
   error banner and stop before POSTing.
3. POST `/api/colaboradores/register` via new `registerColaborador(payload)` client
   function. Payload sends `nombre` as the plain first-name field — **not** concatenated
   with apellidoPaterno/apellidoMaterno like web1's request body does (web1's
   concatenation is a pre-existing bug: backend stores that full string as `Usuario.nombre`
   whenever apellidoPaterno is present, duplicating the surname into the wrong column).
   apellidoPaterno/apellidoMaterno are sent as their own fields either way.
4. On `data.success`: call the existing `login(email, password)` to obtain a token, then
   `onLogin()` — auto-login into the app. (Deviates from web1, which just shows a success
   message and requires manual login — approved as a mobile UX improvement since the
   register endpoint always auto-approves collaborators.)
5. On any failure (validation, duplicate check, or register call): surface the message in
   the existing `error` state / error banner. No email-sending step is added anywhere in
   this flow.

## New API client functions (`MockupsSwayMobile/src/api/client.js`)

Following the existing `buildErrorResult` pattern used by `createEspecie` etc.:

- `registerColaborador(payload)` → `POST /api/colaboradores/register`
- `checkEmail(email)` → `POST /api/colaboradores/check-email`
- `checkOrcid(orcid)` → `POST /api/colaboradores/check-orcid`
- `checkCedula(cedula)` → `POST /api/colaboradores/check-cedula`

## Out of scope

- No changes to `app/routers/colaboradores.py` or `app/models/colaboradores.py`.
- No email-sending logic on the client (matches instruction: mobile skips web1's email
  step entirely — that step is server-side background task and stays untouched).
- No fix to web1's own concatenated-nombre bug in `templates/especies.html` — mobile
  simply doesn't replicate it.
