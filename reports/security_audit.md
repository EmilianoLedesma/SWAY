# Reporte de Seguridad de API — SWAY

**Proyecto:** SWAY (Sistema de Conservación Marina)
**Fecha:** 2026-06-16
**Commit auditado:** `5f37322`
**Alcance:** Exclusivamente API. Backend FastAPI (puerto 8000) consumido por dos frontends — React (`web2/`, portal colaboradores) y JS vanilla servido por Flask (`assets/js/tienda.js`, usuarios generales). Flask (puerto 5000) no participa en autenticación, solo sirve HTML.
**Ejes evaluados:** API Key · JWT/OAuth · BOLA/IDOR · Roles · Rate Limiting

---

## Resumen Ejecutivo

| Eje | Estado |
|-----|--------|
| API Key | No implementado — no existe en el código |
| JWT/OAuth | Implementado con infraestructura correcta, pero **clave de firma hardcodeada** y **contraseñas sin hashear** |
| BOLA/IDOR | Mixto — endpoints de lectura de pedidos protegidos, creación de pedidos sin auth |
| Roles | Dos roles básicos (`tienda`, `colaborador`), sin rol admin, con bypass de aprobación |
| Rate Limiting | No implementado en ningún endpoint |

Toda la autenticación real del sistema —tanto para el portal React de colaboradores como para el sitio de usuarios generales servido por Flask— pasa por el mismo backend FastAPI vía JWT. Se verificó en vivo contra el contenedor `sway_api` (puerto 8000) y `sway_postgres` (puerto 5433) que ambos frontends usan idéntico patrón: login contra FastAPI → `access_token` guardado en `localStorage` → header `Authorization: Bearer` en cada request. No existen sesiones de servidor activas en producción.

**Cinco hallazgos de este reporte fueron confirmados en runtime contra el contenedor en ejecución** (no solo por lectura de código): bypass de JWT con clave forjada, leak de PII en `/api/avistamientos`, enumeración de usuarios en `check-email`, ausencia de rate limit en login, y alcanzabilidad sin auth de `/api/pedidos/crear`. El detalle de cada prueba está en su sección correspondiente.

---

## 1. API Key

### Estado: NO IMPLEMENTADO

Búsqueda exhaustiva en el código (`api_key`, `API_KEY`, `X-API-Key`, `apikey`) sin resultados. El proyecto no tiene ningún mecanismo de autenticación por clave de API; toda la autenticación es JWT de sesión de usuario.

### Dónde haría falta

Hay endpoints que no representan acciones de un usuario con sesión, sino tareas de sistema/administración, y hoy están completamente abiertos porque no existe ningún mecanismo —ni JWT de admin ni API Key— para protegerlos:

| Endpoint | Por qué necesita un mecanismo no-JWT |
|----------|--------------------------------------|
| `POST /api/setup-tienda` | Siembra de catálogo — tarea de despliegue, no de usuario |
| `POST /api/newsletter/enviar` | Disparo masivo de email — tarea de sistema/cron, no de usuario navegando |

### Propuesta de implementación (documentación, sin tocar código)

```python
# Tabla nueva: api_keys (id, nombre_cliente, key_hash, activa, scopes)

# app/security/api_key.py (archivo nuevo propuesto)
import hashlib, secrets
from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session
from app.data.database import get_db
from app.data.models import ApiKey  # modelo nuevo propuesto

def generar_api_key() -> tuple[str, str]:
    """Devuelve (clave_en_claro_para_entregar_una_vez, hash_para_guardar)."""
    clave = f"sway_{secrets.token_urlsafe(32)}"
    return clave, hashlib.sha256(clave.encode()).hexdigest()

async def verificar_api_key(x_api_key: str = Header(...), db: Session = Depends(get_db)):
    hash_recibido = hashlib.sha256(x_api_key.encode()).hexdigest()
    registro = db.query(ApiKey).filter(ApiKey.key_hash == hash_recibido, ApiKey.activa == True).first()
    if not registro:
        raise HTTPException(status_code=401, detail="API Key inválida")
    return registro
```

```python
# Uso en endpoints de mantenimiento:
@router.post("/setup-tienda")
async def setup_tienda(cliente: ApiKey = Depends(verificar_api_key), db: Session = Depends(get_db)):
    ...

@router.post("/newsletter/enviar")
async def enviar_newsletter(cliente: ApiKey = Depends(verificar_api_key), ...):
    ...
```

**Principios de la propuesta:**
- Clave en claro entregada una sola vez; en BD solo se guarda el hash (mismo principio que debería aplicarse a contraseñas).
- Header `X-API-Key`, nunca query string (evita que quede en logs de acceso).
- Mecanismo independiente del JWT de usuario — sirve para sistemas/scripts, no reemplaza el rol de administrador.

**Esfuerzo estimado:** 3-4 horas.

---

## 2. JWT / OAuth

### Estado: IMPLEMENTADO, COMPROMETIDO

**Archivo:** `app/security/auth.py`

```
Algoritmo:   HS256
Expiración:  8 horas (ACCESS_TOKEN_EXPIRE_HOURS = 8)
Esquema:     HTTPBearer (Authorization: Bearer <token>)
Biblioteca:  python-jose[cryptography]
```

**Claims del token:**
```json
{
  "sub": "<user_id>",
  "email": "<email>",
  "name": "<nombre_completo>",
  "token_type": "tienda" | "colaborador",
  "colaborador_id": "<id>",
  "exp": <unix_timestamp>
}
```

**Guards de dependencia:**

| Función | Requiere token | Verifica `token_type` | Si falla |
|---------|----------------|------------------------|----------|
| `get_current_tienda_user` | Sí | `"tienda"` | HTTP 401 |
| `get_current_colaborador` | Sí | `"colaborador"` | HTTP 401 |
| `get_optional_tienda_user` | No | `"tienda"` | Retorna `None` (silencia errores de token inválido) |

No hay flujo OAuth de terceros (Google, etc.) en el proyecto — el esquema es JWT propio, no OAuth2 estándar con authorization server.

### Prueba en vivo — Bypass confirmado con token forjado

Se generó un JWT firmado con la clave hardcodeada del repositorio (`sway_secret_key_ultra_secreta`) dentro del propio contenedor `sway_api`, usando la misma librería `python-jose` ya instalada:

```bash
$ docker exec sway_api python -c "
from jose import jwt
import time
SECRET_KEY = 'sway_secret_key_ultra_secreta'
payload = {'sub': '1', 'email': 'forged@test.com', 'name': 'Forged Token', 'token_type': 'tienda', 'exp': int(time.time()) + 3600}
print(jwt.encode(payload, SECRET_KEY, algorithm='HS256'))
"
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwi...
```

Token usado contra el endpoint protegido `GET /api/user/status`:

```bash
$ curl -s -w "\nHTTP_CODE:%{http_code}\n" http://localhost:8000/api/user/status
{"detail":"No autenticado"}
HTTP_CODE:401

$ curl -s -w "\nHTTP_CODE:%{http_code}\n" http://localhost:8000/api/user/status \
    -H "Authorization: Bearer <token_forjado>"
{"success":true,"user":{"id":1,"nombre":"Ana García López","email":"ana.garcia@email.com",
"telefono":"4421234567","fecha_registro":"2024-01-15T00:00:00","fecha_nacimiento":"1985-03-15"}}
HTTP_CODE:200
```

**Resultado: bypass confirmado en runtime, no solo en teoría.** Con un token firmado fuera del sistema (sin login, sin credenciales) se obtuvo el perfil completo de un usuario real, incluyendo PII (nombre completo, teléfono, fecha de nacimiento). Esto valida que el hallazgo de SECRET_KEY hardcodeada es explotable de forma directa y trivial, no un riesgo teórico.

### Hallazgo CRÍTICO — SECRET_KEY hardcodeada

**`app/security/auth.py:7`:**
```python
SECRET_KEY = "sway_secret_key_ultra_secreta"
```

Con esta clave pública en el repositorio, cualquiera puede firmar tokens válidos para cualquier usuario o colaborador:
```python
import jwt
jwt.encode({"sub": "1", "token_type": "colaborador", "colaborador_id": 1, "exp": 9999999999},
           "sway_secret_key_ultra_secreta", algorithm="HS256")
```

**Fix:**
```python
import os
SECRET_KEY = os.environ["JWT_SECRET_KEY"]  # sin default, falla si no está configurada
```

### Hallazgo CRÍTICO — Contraseñas sin hashear en todos los flujos de login/registro

El campo se llama `password_hash` pero nunca se le aplica hash en los endpoints FastAPI (que son el único backend de autenticación real, ver Resumen Ejecutivo):

| Archivo | Línea | Código |
|---------|-------|--------|
| `app/routers/auth.py` | 55 | `if user and user.password_hash == data.password:` |
| `app/routers/auth.py` | 115 | `password_hash=data.password` |
| `app/routers/auth.py` | 241 | `filter(Usuario.password_hash == data.password)` |
| `app/routers/colaboradores.py` | 36 | `if user.password_hash != data.password:` |
| `app/routers/colaboradores.py` | 119 | `password_hash=data.password` |
| `app/routers/colaboradores.py` | 401, 404 | comparación y asignación directa en cambio de contraseña |

**Fix:**
```python
from werkzeug.security import generate_password_hash, check_password_hash

password_hash=generate_password_hash(data.password)            # al guardar
check_password_hash(user.password_hash, data.password)          # al verificar
```

### Hallazgo MEDIO — JWT en `localStorage` en ambos frontends

`web2/src/api/client.js` (React) y `assets/js/tienda.js` (Flask) guardan el token en `localStorage` (`colab_token` / `tienda_token`) en vez de cookie `httpOnly`. Cualquier XSS en cualquiera de los dos frontends permite robar el token durante las 8 horas de validez.

**Fix propuesto:** Emitir el JWT como cookie `httpOnly`, `Secure`, `SameSite=Strict` desde FastAPI (`Response.set_cookie`) en lugar de devolverlo en el body para que el JS lo guarde.

---

## 3. BOLA / IDOR

### Estado: MIXTO

**Endpoints correctamente protegidos (verifican ownership contra el JWT):**

| Endpoint | Verificación |
|----------|-------------|
| `GET /api/pedidos/mis-pedidos` | Filtra por `user_id` del JWT |
| `GET /api/pedidos/usuario/{user_id}` | `int(current_user["sub"]) != user_id` → 403 |
| `GET /api/pedidos/detalle/{pedido_id}` | `pedido.id_usuario != user_id` → 403 |
| `POST /api/pedidos/reordenar/{pedido_id}` | `pedido.id_usuario != user_id` → 403 |

### Hallazgo CRÍTICO — `POST /api/pedidos/crear` sin autenticación

**`app/routers/pedidos.py:66`:**
```python
@router.post("/pedidos/crear")
async def crear_pedido(data: PedidoCreate, db: Session = Depends(get_db)):
    # Sin Depends(get_current_tienda_user)
    nuevo_pedido = Pedido(
        id_usuario=data.user_id,   # user_id viene del body, no del JWT
        ...
    )
```

Verificado en vivo contra el contenedor:
```bash
$ curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/api/pedidos/crear \
    -H "Content-Type: application/json" -d '{}'
422   # Error de validación de body, NO 401/403 → endpoint alcanzable sin token
```

Cualquier atacante puede crear pedidos a nombre de cualquier `user_id` existente, sin autenticarse, modificando el stock real de productos.

**Fix:**
```python
@router.post("/pedidos/crear")
async def crear_pedido(
    data: PedidoCreate,
    current_user: dict = Depends(get_current_tienda_user),
    db: Session = Depends(get_db)
):
    user_id = int(current_user["sub"])  # del JWT, nunca del body
```

### Hallazgo ALTO — PII expuesta sin control de acceso por owner

**`app/routers/estadisticas.py:106`** — `GET /api/avistamientos` devuelve `email_usuario` de **todos** los registros de todos los usuarios, sin autenticación ni filtro de ownership. Cualquiera puede enumerar emails de usuarios que reportaron avistamientos.

**Confirmado en vivo (sin ningún header de autenticación):**
```bash
$ curl -s http://localhost:8000/api/avistamientos
{"success":true,"avistamientos":[
  {"id":12,...,"especie_nombre":"Narval","email_usuario":"juan.martinez@email.com"},
  {"id":11,...,"especie_nombre":"Foca Monje del Mediterráneo","email_usuario":"maria.fernandez@email.com"},
  ...
]}
```
Emails reales de usuarios obtenidos sin ninguna credencial.

**Fix:** Eliminar `email_usuario` del response, o exigir `get_current_colaborador` si el dato es de uso interno.

---

## 4. Roles

### Estado: DOS ROLES BÁSICOS, SIN JERARQUÍA ADMINISTRATIVA

| Rol | Se obtiene en | Claim JWT | Alcance |
|-----|---------------|-----------|---------|
| Usuario tienda | `POST /api/user/register` | `token_type: "tienda"` | Pedidos propios, perfil |
| Colaborador | `POST /api/colaboradores/register` (auto-aprobado) | `token_type: "colaborador"` | CRUD de especies, avistamientos |
| Administrador | **No existe** | — | — |

### Hallazgo ALTO — Auto-aprobación de colaboradores sin revisión

**`app/routers/colaboradores.py:138`:**
```python
estado_solicitud="aprobada",
fecha_aprobacion=datetime.utcnow(),
aprobado_por=None,   # nunca pasa por revisión humana
```

Cualquier persona en internet puede registrarse como "colaborador científico" y obtener acceso inmediato a `POST/PUT/DELETE /api/especies` — modificar el catálogo público de especies marinas — sin que ningún humano apruebe la solicitud. El campo `estado_solicitud` existe en el modelo de datos (sugiriendo que se diseñó un flujo de aprobación) pero el código nunca lo respeta.

### Hallazgo MEDIO — Enumeración de usuarios vía `check-email`, `check-orcid` y `check-cedula`

**Confirmado en vivo contra los tres endpoints — mismo patrón en cada uno:**
```bash
$ curl -s -X POST http://localhost:8000/api/colaboradores/check-email \
    -H "Content-Type: application/json" -d '{"email":"noexiste_zzz999@inventado.com"}'
{"exists":false,"can_register":true}

$ curl -s -X POST http://localhost:8000/api/colaboradores/check-email \
    -H "Content-Type: application/json" -d '{"email":"ana.garcia@email.com"}'
{"exists":true,"can_register":true}

$ curl -s -X POST http://localhost:8000/api/colaboradores/check-orcid \
    -H "Content-Type: application/json" -d '{"orcid":"0000-0002-8394-781X"}'
{"exists":true,"can_register":false,"message":"Este ORCID ya pertenece a un colaborador activo"}

$ curl -s -X POST http://localhost:8000/api/colaboradores/check-cedula \
    -H "Content-Type: application/json" -d '{"cedula":"9876543"}'
{"exists":true,"can_register":false,"message":"Esta cédula ya pertenece a un colaborador activo"}
```
Los tres endpoints delatan directamente si un email, ORCID o número de cédula está registrado en el sistema, sin rate limit ni autenticación, permitiendo enumerar identidades de colaboradores por fuerza bruta.

**Fix:**
```python
# Cambiar en el registro:
estado_solicitud="pendiente",
fecha_aprobacion=None,
aprobado_por=None,
```
Y crear un endpoint separado `PUT /api/admin/colaboradores/{id}/aprobar` protegido por un rol de administrador (hoy inexistente — requiere primero resolver el punto siguiente).

### Hallazgo ALTO — Falta de rol administrador

No hay ningún claim ni guard para "admin" en todo `app/security/auth.py`. Esto bloquea:
- Aprobar/rechazar solicitudes de colaborador.
- Proteger `POST /api/setup-tienda` y `POST /api/newsletter/enviar` con un rol superior en vez de dejarlos abiertos.
- Cualquier panel de moderación futuro.

**Propuesta:** Agregar un tercer valor a `token_type` (`"admin"`) y un guard `get_current_admin`, asignable manualmente en BD (no vía registro público) hasta que exista un panel de gestión de roles.

---

## 5. Rate Limiting

### Estado: NO IMPLEMENTADO en ningún endpoint

| Endpoint | Riesgo sin rate limit |
|----------|------------------------|
| `POST /api/user/login` | Fuerza bruta de contraseñas |
| `POST /api/colaboradores/login` | Fuerza bruta de contraseñas |
| `POST /api/auth/login` | Fuerza bruta de contraseñas |
| `POST /api/newsletter` | Spam de creación de usuarios ghost |
| `POST /api/reportar-avistamiento` | Flood de registros en BD |
| `POST /api/pedidos/crear` | Agotamiento de stock vía requests automatizados (agravado por ser BOLA, ver sección 3) |

**Confirmado en vivo — 10 intentos de login fallido consecutivos sin bloqueo:**
```bash
$ for i in $(seq 1 10); do
    curl -s -o /dev/null -w "Intento $i -> HTTP %{http_code}\n" \
      -X POST http://localhost:8000/api/user/login -H "Content-Type: application/json" \
      -d '{"email":"ana.garcia@email.com","password":"intento_incorrecto_'$i'"}'
  done
Intento 1 -> HTTP 401
Intento 2 -> HTTP 401
...
Intento 10 -> HTTP 401
```
Los 10 intentos devolvieron 401 sin ningún código 429 ni incremento de latencia — confirma ausencia total de throttling, habilitando fuerza bruta de contraseñas sin límite.

**Fix propuesto — `slowapi`:**
```bash
pip install slowapi
```

```python
# app/main.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

```python
# app/routers/auth.py
from fastapi import Request
from app.main import limiter

@router.post("/user/login")
@limiter.limit("5/minute")
async def user_login(request: Request, data: UserLogin, db: Session = Depends(get_db)):
    ...
```

Aplicar el mismo decorador a `colaboradores.login`, `auth.login`, `newsletter`, y `reportar-avistamiento`.

**Esfuerzo estimado:** ~1 hora para los 5 endpoints críticos.

---

## Matriz de Remediación Priorizada

| Prioridad | Hallazgo | Eje | Esfuerzo |
|-----------|----------|-----|---------|
| P0 — Hoy | SECRET_KEY hardcodeada | JWT/OAuth | 10 min |
| P0 — Hoy | Hashear contraseñas (6 puntos) | JWT/OAuth | 45 min |
| P0 — Hoy | Auth guard + user_id del JWT en `POST /api/pedidos/crear` | BOLA/IDOR | 10 min |
| P0 — Hoy | Cambiar auto-aprobación de colaboradores a `"pendiente"` | Roles | 5 min |
| P1 — Esta semana | Eliminar `email_usuario` de `/api/avistamientos` | BOLA/IDOR | 5 min |
| P1 — Esta semana | Rate limiting en endpoints de login + newsletter | Rate Limiting | 1 hora |
| P1 — Esta semana | Rol de administrador (`get_current_admin`) | Roles | 2-3 horas |
| P2 — Próxima semana | API Key para endpoints de mantenimiento | API Key | 3-4 horas |
| P2 — Próxima semana | Mover JWT de `localStorage` a cookie `httpOnly` (ambos frontends) | JWT/OAuth | 2-3 horas |

---

## Evidence Index

| Hallazgo | Archivo | Línea |
|---------|---------|-------|
| SECRET_KEY hardcodeada | `app/security/auth.py` | 7 |
| Plaintext login tienda | `app/routers/auth.py` | 55 |
| Plaintext register tienda | `app/routers/auth.py` | 115 |
| Plaintext login auth | `app/routers/auth.py` | 241 |
| Plaintext login colaborador | `app/routers/colaboradores.py` | 36 |
| Plaintext register colaborador | `app/routers/colaboradores.py` | 119 |
| Plaintext cambio contraseña | `app/routers/colaboradores.py` | 401, 404 |
| BOLA pedidos/crear | `app/routers/pedidos.py` | 66 |
| PII emails público | `app/routers/estadisticas.py` | 106 |
| Auto-aprobación colaborador | `app/routers/colaboradores.py` | 138 |
| JWT en localStorage (React) | `web2/src/api/client.js` | 4 |
| JWT en localStorage (Flask/JS) | `assets/js/tienda.js` | 7 |
| Sin rol admin | `app/security/auth.py` | — (ausencia) |
| Sin API Key | proyecto completo | — (ausencia) |
| Sin rate limiting | proyecto completo | — (ausencia) |
| Enumeración de usuarios | `app/routers/colaboradores.py` | check-email |

---

## Pruebas en Vivo Realizadas (no destructivas)

Todas las pruebas se ejecutaron contra el contenedor real `sway_api` (puerto 8000) sin escribir ni modificar datos en la base de datos.

| # | Prueba | Comando clave | Resultado |
|---|--------|---------------|-----------|
| 1 | Bypass JWT con clave forjada | `docker exec sway_api python -c "from jose import jwt..."` + `curl .../api/user/status -H "Authorization: Bearer <forjado>"` | **200 OK** — PII real de usuario id=1 devuelta sin login |
| 2 | PII leak en avistamientos | `curl http://localhost:8000/api/avistamientos` | Emails reales (`juan.martinez@email.com`, etc.) devueltos sin auth |
| 3 | Enumeración de usuarios | `curl -X POST .../check-email -d '{"email":"..."}'` con email inexistente vs. existente | `{"exists":false}` vs `{"exists":true}` — confirma enumeración |
| 4 | Ausencia de rate limit | 10x `curl -X POST .../user/login` con password incorrecta | 10/10 → HTTP 401, sin 429 ni bloqueo |
| 5 | BOLA en creación de pedidos | `curl -X POST .../pedidos/crear -d '{}'` sin token | HTTP 422 (validación), no 401/403 → confirma alcanzable sin auth |
| 6 | Bypass JWT — rol colaborador | Token forjado con `token_type: "colaborador"` y email real (consulta de solo lectura a Postgres para obtenerlo) contra `GET /api/colaboradores/profile` | **200 OK** — perfil completo devuelto (ORCID, cédula, institución) sin login real. Confirma que el bypass de SECRET_KEY no es exclusivo del rol `tienda`. |
| 7 | Confusión de tipo de token | Token `token_type: "tienda"` contra guard `get_current_colaborador` | **401** `"Token de tipo incorrecto"` — la verificación de tipo funciona correctamente (buena noticia, no es un hallazgo) |
| 8 | Rechazo de token expirado | Token forjado con `exp` en el pasado contra `GET /api/user/status` | **401** `"Token inválido o expirado"` — la validación de expiración funciona correctamente (buena noticia, no es un hallazgo) |
| 9 | Ownership check cruzado en pedidos | Token de user=1 pidiendo `GET /api/pedidos/usuario/2` | **403** `"No autorizado para ver estos pedidos"` — confirma que la protección de ownership documentada en la sección 3 es real, no solo código leído. Con `usuario/1` (propio) → 200 OK correcto. |
| 10 | Enumeración por ORCID/cédula | `check-orcid` y `check-cedula` con valores reales vs. inventados | Ambos endpoints confirman existencia (`exists:true/false`) — mismo patrón de enumeración que `check-email`, ahora extendido a dos campos más |
| 11 | Reachability de PDF sin auth | `curl http://localhost:8000/api/reportes/especies` | **200 OK**, `Content-Type: application/pdf`, 3237 bytes — confirma que el reporte de especies se descarga sin ninguna credencial |

**Nota fuera de alcance pero verificada de paso:** se probó CORS con `OPTIONS` y origen no autorizado (`evil-site.com`) → rechazado con `400 Disallowed CORS origin`. Con origen permitido (`localhost:5173`) → `200 OK` con headers correctos. La configuración de CORS está correctamente implementada (whitelist de orígenes funcional); no se incluye como hallazgo porque no corresponde a ninguno de los 5 ejes solicitados.

---

## Scan Metadata

| Campo | Valor |
|-------|-------|
| Fecha | 2026-06-16 |
| Commit | `5f37322` |
| Alcance | API únicamente — API Key, JWT/OAuth, BOLA/IDOR, Roles, Rate Limiting |
| Verificación en vivo | Contenedores `sway_api` (8000) y `sway_postgres` (5433) — 5 pruebas no destructivas ejecutadas |
| Archivos analizados | `app/security/auth.py`, `app/routers/{auth,colaboradores,pedidos,estadisticas}.py`, `web2/src/api/client.js`, `assets/js/tienda.js` |

---
Generated by: Somnio CLI vunknown
Skill: security-audit + ghost-report
Date: 2026-06-16
