# Handoff técnico — Seguridad API SWAY
**Última actualización:** Julio 2026 | **Rama:** `seguridad_api` | **Actualizar en cada sesión**

Este documento es bitácora interna para Claude web (orquestador del proyecto). Resume el trabajo realizado en seguridad de la API, decisiones técnicas y pendientes de acción manual.

---

## 1. Archivos creados o modificados (trabajo de seguridad completo)

### Código de la aplicación

| Archivo | Tipo | Qué cambió |
|---|---|---|
| `app/security/auth.py` | Modificado | `SECRET_KEY` movido de hardcode a `os.getenv("JWT_SECRET_KEY", "cambia_esto_en_produccion")`. Instancia `HTTPBearer(auto_error=False)` expuesta como `bearer_scheme` para Swagger. |
| `app/security/api_key.py` | Nuevo | Dependencia FastAPI con `APIKeyHeader(name="x-api-key", auto_error=False)`. Valida contra `os.getenv("API_KEY")`. Devuelve `401` si falta o es inválida, `500` si la var de entorno no está configurada. |
| `app/security/rate_limit.py` | Nuevo | Instancia compartida de `slowapi.Limiter` con `key_func=get_remote_address` y `storage_uri="memory://"`. Se importa en `main.py` y en cada router. |
| `app/main.py` | Modificado | Añadido: `SlowAPIMiddleware`, handler `RateLimitExceeded`, `Security(require_api_key)` como dependencia global en los 9 routers. Función `custom_openapi()` para inyectar `ApiKeyAuth` en el spec OpenAPI (workaround a limitación de FastAPI: router-level dependencies con `Depends` no se propagan al spec). |
| `app/routers/auth.py` | Modificado | Contraseñas: `generate_password_hash` en registro, `check_password_hash` en login. Rate limiting con `@limiter.limit()` en 6 endpoints. `field_validator` en `UserRegister.fecha_nacimiento` para normalizar `DD/MM/YYYY` y `DD-MM-YYYY` a `YYYY-MM-DD`. |
| `app/routers/colaboradores.py` | Modificado | Mismo fix de hashing en login, registro y cambio de contraseña. |
| `app/routers/pedidos.py` | Modificado | Protección BOLA/IDOR en `POST /api/pedidos/crear`: `user_id = int(current_user["sub"])` tomado del JWT, `data.user_id` ignorado. Protección IDOR en `GET /api/pedidos/usuario/{user_id}` y `GET /api/pedidos/detalle/{pedido_id}`: comparación `current_user["sub"] != user_id`. |
| `app/models/pedidos.py` | Modificado | `user_id: Optional[int] = Field(None, ...)` con descripción explícita de que es ignorado por el servidor. |
| `requirements.txt` | Modificado | Añadido `slowapi>=0.1.9`. |

### Infraestructura

| Archivo | Tipo | Qué cambió |
|---|---|---|
| `docker-compose.yml` | Modificado | Marcado como archivo de referencia monolítica (ya no se usa). Comentario en la cabecera. |
| `docker-compose.public.yml` | Nuevo | Servicios `nginx` (puertos 80/443) y `monitoring` (uptime-kuma, puerto 3001). Sin `env_file`. Volúmenes con flag `:ro,z` por SELinux en Fedora. |
| `docker-compose.private.yml` | Nuevo | Servicios `api_1` (`:8001`), `api_2` (`:8002`) y `postgres` (sin puertos expuestos). Credenciales de BD desde `${DB_USER}/${DB_PASSWORD}/${DB_NAME}` — nunca hardcodeadas. Sin `POSTGRES_HOST_AUTH_METHOD: trust`. Healthcheck con `$$POSTGRES_USER` (doble `$` para escapar sustitución de Compose y que llegue como `$VAR` al shell del contenedor). |
| `nginx/nginx.conf` | Nuevo → Modificado | Creado con upstream `api_1:8000` / `api_2:8000`. Luego cambiado a `10.10.10.2:8001` / `10.10.10.2:8002` para arquitectura de dos VMs. Redirect 301 HTTP→HTTPS, TLS 1.2/1.3, proxy headers estándar. |
| `nginx/certs/sway.crt` | Nuevo (no versionado) | Certificado autofirmado RSA-2048, 365 días, CN=sway.local. Generado con `openssl req -x509`. |
| `nginx/certs/sway.key` | Nuevo (no versionado) | Clave privada del certificado. Permisos 600. |
| `scripts/ufw_public.sh` | Nuevo | Reglas UFW para VM pública: `deny incoming` + permite 22, 80, 443, 3001 desde cualquier origen. |
| `scripts/ufw_private.sh` | Nuevo | Reglas UFW para VM privada: `deny incoming` + permite 22 solo desde `10.10.10.0/24`, 8001 y 8002 solo desde `10.10.10.1`. PostgreSQL (5432) no se abre al host. |
| `.env` | Nuevo (no versionado) | Secretos locales del entorno de desarrollo. Valores reales, nunca subirlo. |
| `.env.example` | Modificado | Actualizado para reflejar que solo aplica al servidor privado. Variables `DB_USER/DB_PASSWORD/DB_NAME` documentadas como fuente para postgres Y para `DATABASE_URL`. `CORS_ORIGINS` apunta a IP del servidor Nginx. |
| `.gitignore` | Modificado | Añadido `nginx/certs/`. |

### Documentación

| Archivo | Tipo | Qué cambió |
|---|---|---|
| `docs/seguridad_api.md` | Nuevo → Actualizado | Reporte de seguridad completo para entrega académica. Incluye instrucciones para que Claude web genere un PDF. Cubre todas las medidas implementadas con código, tablas de prueba y arquitectura de dos VMs. **Correcciones post-despliegue (Julio 2026):** monitor URL `localhost` → `<IP_LAN_VM_PUBLICA>`, nota "Ignore TLS/SSL errors", tercer monitor `api_2`, nota tolerancia a fallos, `sway-internal` → `sway_net`, nota de rama en sección 4.5, tabla de requerimientos actualizada a 3 monitores. |
| `docs/handoff_claude_web.md` | Nuevo → Actualizado | Este archivo. Bitácora interna. Sección 4 reescrita: pendientes VM marcados como completados, Uptime Kuma con URLs correctas. Sección 5 nueva: solo 3 pendientes de código. |

---

## 2. Decisiones técnicas y justificación

### `Depends` vs `Security` para API Key global
FastAPI solo añade un `SecurityBase` al OpenAPI spec cuando se usa `Security()`, no `Depends()`. Las dependencias pasadas vía `include_router(dependencies=[...])` son funcionales pero invisibles para el spec. Solución: `Security(require_api_key)` en los routers + `custom_openapi()` que inyecta `ApiKeyAuth` manualmente al schema y lo añade al bloque `security` de cada operación. Esto hace que Swagger UI muestre ambos campos en el botón Authorize.

### `auto_error=False` en `HTTPBearer` y `APIKeyHeader`
Se usa para poder devolver errores personalizados (JSON estructurado) en lugar del 403 automático de FastAPI. La función wrapper (`require_api_key`, `get_current_tienda_user`) hace la validación explícita y lanza `HTTPException` con el mensaje adecuado.

### Eliminación de `POSTGRES_HOST_AUTH_METHOD: trust`
`trust` desactiva la autenticación por contraseña para todas las conexiones, incluidas las locales. Aunque el puerto no esté expuesto al host, es una mala práctica en un proyecto de seguridad porque cualquier proceso dentro del contenedor puede conectarse sin credenciales. Sin esta variable, Postgres 15 usa `scram-sha-256` por defecto. La `DATABASE_URL` ya incluye usuario y contraseña, así que las APIs se autentican normalmente.

### `$$POSTGRES_USER` en healthcheck
En un archivo docker-compose YAML, `${VAR}` es sustituido por Docker Compose en tiempo de parseo (host-side). `$$VAR` se convierte en `$VAR` literal y llega al shell dentro del contenedor, donde se evalúa como variable de entorno del proceso. El healthcheck necesita acceder a las vars del contenedor en runtime, no a las del host en parse-time.

### Arquitectura de dos VMs con red interna VirtualBox
La red interna (`intnet` en VirtualBox) crea un segmento L2 aislado que no tiene salida al host ni a la LAN. La VM pública tiene adaptador puente (LAN) + adaptador de red interna. La VM privada solo tiene adaptador de red interna. Esto garantiza que la VM privada sea físicamente inalcanzable desde la LAN aunque no haya firewall — el firewall UFW es defensa adicional, no el único aislamiento.

### Volúmenes `:ro,z` en docker-compose.public.yml
En Fedora con SELinux en modo `Enforcing`, Docker no puede leer archivos del directorio home del usuario (`user_home_t`) sin el flag `:z`. Este flag hace que Docker relabele los archivos con el contexto `container_file_t`. Se necesita recrear el contenedor (no solo reiniciarlo) para que el relabel tome efecto.

### `slowapi` con `storage_uri="memory://"`
Almacena los contadores de rate limiting en memoria del proceso. Implica que si hay dos instancias del API (api_1 y api_2), cada una lleva su propio contador — un cliente podría hacer 5 req a api_1 y 5 req a api_2 antes de ser bloqueado. Para producción real se usaría Redis compartido (`storage_uri="redis://..."`), pero para el alcance académico del proyecto es suficiente.

### `custom_openapi()` y caché de schema
FastAPI cachea el schema en `app.openapi_schema`. La función `custom_openapi()` verifica el caché antes de regenerar. Solo se ejecuta una vez por arranque del proceso. Si se cambia el schema en caliente (no aplica en producción), habría que invalidar el caché manualmente.

---

## 3. Problemas encontrados y cómo se resolvieron

### Contraseñas en texto plano (crítico)
**Problema:** `password_hash=data.password` en `auth.py` y `colaboradores.py`. Login comparaba directamente con `==`.
**Solución:** `werkzeug.security.generate_password_hash` / `check_password_hash` (bcrypt). El login en `auth_login` no puede filtrar por hash en SQL; se trae el usuario por email y compara en Python.
**Consecuencia:** usuarios registrados antes del fix no pueden hacer login. Deben re-registrarse. **Anotado en el reporte para avisar al equipo antes del merge a master.**

### `APIKeyHeader` no aparecía en Swagger Authorize
**Problema:** Con `Depends(require_api_key)` en `include_router`, Swagger no mostraba el campo `x-api-key`.
**Causa raíz:** FastAPI solo propaga security schemes al OpenAPI spec cuando la dependencia está directamente en el handler, no en el router. `Depends` en router-level es transparente para el spec.
**Solución:** cambiar a `Security(require_api_key)` en router-level + función `custom_openapi()` que añade el esquema `ApiKeyAuth` manualmente al spec y lo asocia a cada operación.
**Iteración previa fallida:** se intentó `docker compose build --no-cache` pensando que era un problema de caché de imagen. No era ese el problema.

### Container caché de Docker (Fedora)
**Problema:** cambios en `app/security/api_key.py` no se reflejaban aunque se había hecho build.
**Causa:** los cambios se hicieron DESPUÉS del último `--no-cache` build. El restart del contenedor no reconstruye la imagen.
**Solución:** siempre `docker compose build [service]` (sin `--no-cache` si solo cambió código Python, ya que el layer `COPY . .` sí invalida) + `docker compose up -d`.

### SELinux bloqueando Nginx en Fedora
**Problema:** `nginx: [emerg] open() "/etc/nginx/nginx.conf" failed (13: Permission denied)`.
**Causa:** SELinux en modo `Enforcing`. El archivo `nginx.conf` tiene contexto `user_home_t`, que el contenedor Docker no puede leer.
**Solución:** flag `:z` en los volúmenes de Nginx en el compose (`./nginx/nginx.conf:/etc/nginx/nginx.conf:ro,z`). Requiere recrear el contenedor (no solo restart) para que Docker aplique el relabel de SELinux.

### `relation "usuarios" does not exist`
**Problema:** al levantar el contenedor postgres con un volumen ya existente pero sin el schema, las APIs devolvían 500 con este error.
**Causa:** el volumen `postgres_data` existía de un run anterior sin el SQL de inicialización, así que Docker no volvió a ejecutar `/docker-entrypoint-initdb.d/01_init.sql`.
**Solución puntual:** `docker compose exec -T postgres psql -U sway_app -d sway < SWAY_PostgreSQL.sql`.
**Solución estructural:** en un despliegue limpio en las VMs, el volumen no existe y Docker sí ejecuta el init SQL automáticamente.

### Error de fecha en registro (`"19/01/2004"`)
**Problema:** PostgreSQL rechazaba el campo `fecha_nacimiento` porque esperaba `YYYY-MM-DD`.
**Solución:** `field_validator("fecha_nacimiento", mode="before")` en `UserRegister` que intenta parsear `%Y-%m-%d`, `%d/%m/%Y` y `%d-%m-%Y` y normaliza a `%Y-%m-%d`.

### `dependency postgres failed to start` al reiniciar
**Problema:** timing issue al reiniciar el stack completo; `api_1`/`api_2` arrancaban antes que postgres pasara el healthcheck.
**Causa:** docker compose restart no respeta `depends_on` con healthcheck, solo `up` lo hace.
**Solución:** usar siempre `docker compose up -d` en vez de `restart` para el stack completo.

---

## 4. Estado del despliegue en VMs ✓

**Todo ejecutado — ambas VMs están en producción (Julio 2026).**

### VM privada (10.10.10.2) — completado

| Acción | Estado |
|---|---|
| Red interna VirtualBox configurada (nombre `sway_net`) | ✓ |
| IP `10.10.10.2/24` asignada en Debian | ✓ |
| Repo clonado, rama `seguridad_api` activa | ✓ |
| `.env` creado con credenciales reales | ✓ |
| Volumen `postgres_data` recreado sin `trust` (scram-sha-256) | ✓ |
| `docker compose -f docker-compose.private.yml up -d --build` ejecutado | ✓ |
| UFW aplicado (`scripts/ufw_private.sh`) y verificado | ✓ |
| `curl localhost:8001/` y `localhost:8002/` responden OK | ✓ |

### VM pública (10.10.10.1) — completado

| Acción | Estado |
|---|---|
| Red VirtualBox: Adapter 1 Bridged + Adapter 2 Internal (`sway_net`) | ✓ |
| IP `10.10.10.1/24` asignada en Debian | ✓ |
| Repo clonado, rama `seguridad_api` activa | ✓ |
| Certificado SSL autofirmado generado en `nginx/certs/` | ✓ |
| `docker compose -f docker-compose.public.yml up -d` ejecutado | ✓ |
| UFW aplicado (`scripts/ufw_public.sh`) y verificado | ✓ |
| Uptime Kuma configurado con tres monitores (ver abajo) | ✓ |
| Prueba de aislamiento ejecutada: `10.10.10.2` no responde desde la LAN | ✓ |

### Configuración final de Uptime Kuma

| Monitor | URL configurada | Nota |
|---|---|---|
| SWAY Frente HTTPS | `https://<IP_LAN_VM_PUBLICA>/` | "Ignore TLS/SSL errors" activado (cert autofirmado) |
| SWAY API Privada (api_1) | `http://10.10.10.2:8001/` | Solo alcanzable desde la red interna |
| SWAY API Privada (api_2) | `http://10.10.10.2:8002/` | Opcional — confirma balanceo |

Tolerancia a fallos verificada: detener `sway_api_1` pone el monitor api_1 en rojo pero el frente HTTPS permanece verde (Nginx redirige a `api_2`).

---

## 5. Pendientes de código (futura sesión)

- **Rate limiter Redis:** el limiter usa `storage_uri="memory://"`, contadores independientes por instancia. Para bloqueo coordinado entre `api_1` y `api_2` se necesita Redis. No es crítico para la entrega académica.
- **CORS al cambiar IP:** `CORS_ORIGINS` en `.env` apunta a la IP actual del servidor Nginx. Si cambia la IP de la VM pública, hay que actualizar `.env` y reiniciar las APIs.
- **Renovación del certificado SSL:** el cert autofirmado expira ~Julio 2027 (365 días desde Julio 2026). Para renovar: regenerar con `openssl req -x509 ...` y reiniciar el contenedor `sway_nginx`.
