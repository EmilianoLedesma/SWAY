> **Instrucciones para Claude (web):**
> Convierte este documento Markdown en un PDF profesional con las siguientes características:
> - Portada con título, nombre del proyecto, materia y fecha
> - Índice de contenidos numerado
> - Secciones claramente separadas con encabezados jerarquizados
> - Los bloques de código deben mostrarse en fuente monospace con fondo gris claro
> - Las tablas deben tener estilo limpio con encabezados destacados
> - Incluye el texto completo sin omitir nada
> - Usa un diseño formal de reporte técnico universitario
> - Datos de portada: Proyecto: SWAY | Materia: Programación Orientada a Objetos | Institución: Universidad Politécnica de Querétaro | Alumnos: Antonio Abraham Velazquez Velazquez, Ricardo Mendez Rodriguez, Emiliano Ledesma Ledesma, Artemio Hurtado Hernandez | Fecha: Julio 2026

---

# Reporte de Seguridad — API SWAY

## 1. Introducción

Este reporte documenta los cambios de seguridad implementados sobre la API REST del proyecto SWAY, un sistema de conservación marina desarrollado con **FastAPI**, **PostgreSQL** y **Docker**. Los cambios corresponden a los requerimientos mínimos de seguridad informática del tercer ciclo y a la Práctica de Seguridad de API.

### Stack tecnológico

| Componente | Tecnología |
|---|---|
| Backend | FastAPI (Python 3.11) |
| Base de datos | PostgreSQL 15 |
| Contenedores | Docker + Docker Compose |
| Reverse proxy / SSL / LB | Nginx (alpine) |
| Autenticación | JWT (`python-jose`) |
| Hashing | Werkzeug (`bcrypt`) |
| Rate limiting | `slowapi` |
| Monitoreo | Uptime Kuma |
| Firewall | UFW (VMs Debian) |
| Documentación interactiva | Swagger UI (`/docs`) |

---

## 2. Vulnerabilidades identificadas y corregidas

### 2.1 Contraseñas en texto plano

**Problema:** Los endpoints de registro y login almacenaban y comparaban contraseñas en texto plano directamente en la base de datos.

```python
# ANTES — código inseguro
nuevo_usuario = Usuario(
    email=data.email,
    password_hash=data.password   # texto plano
)

# Login
if user.password_hash != data.password:   # comparación directa
    raise HTTPException(status_code=401, ...)
```

**Impacto:** Un volcado de la base de datos exponía todas las contraseñas de usuarios de forma inmediata.

**Corrección aplicada** en `app/routers/auth.py` y `app/routers/colaboradores.py`:

```python
from werkzeug.security import generate_password_hash, check_password_hash

# Registro
nuevo_usuario = Usuario(
    email=data.email,
    password_hash=generate_password_hash(data.password)   # bcrypt
)

# Login
if not check_password_hash(user.password_hash, data.password):
    raise HTTPException(status_code=401, detail="Credenciales inválidas")
```

El algoritmo usado es **bcrypt** a través de Werkzeug. Bcrypt aplica un salt aleatorio por cada hash, lo que evita ataques de rainbow table y hace que dos hashes del mismo password sean siempre distintos.

> **Nota para el equipo:** Los usuarios registrados antes de este cambio no podrán iniciar sesión ya que su `password_hash` en BD es texto plano. Deberán registrarse nuevamente.

---

### 2.2 JWT secret hardcodeado

**Problema:** La clave secreta para firmar tokens JWT estaba escrita directamente en el código fuente.

```python
# ANTES
SECRET_KEY = "mi_clave_super_secreta_sway_2024"
```

**Corrección** en `app/security/auth.py`:

```python
import os

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "cambia_esto_en_produccion")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8
```

La clave se lee de la variable de entorno `JWT_SECRET_KEY`, inyectada al contenedor mediante el archivo `.env`.

---

## 3. Nuevas medidas de seguridad implementadas

### 3.1 API Key

Se implementó autenticación por API Key como primera capa de protección. Todos los endpoints del sistema requieren el header `x-api-key` con un valor válido.

**Archivo:** `app/security/api_key.py`

```python
import os
from fastapi import HTTPException
from fastapi.security import APIKeyHeader

_API_KEY = os.getenv("API_KEY")
_api_key_header = APIKeyHeader(name="x-api-key", auto_error=False)

def require_api_key(x_api_key: str | None = _api_key_header):
    if not _API_KEY:
        raise HTTPException(status_code=500, detail="API Key no configurada en el servidor")
    if x_api_key != _API_KEY:
        raise HTTPException(
            status_code=401,
            detail={"error": "No autorizado", "mensaje": "API Key inválida o no enviada"}
        )
    return True
```

La dependencia se aplica **globalmente a todos los routers** en `app/main.py`:

```python
from fastapi import Security
from app.security.api_key import require_api_key

_api_key_dep = [Security(require_api_key)]

app.include_router(auth.router,          dependencies=_api_key_dep)
app.include_router(colaboradores.router, dependencies=_api_key_dep)
app.include_router(especies.router,      dependencies=_api_key_dep)
app.include_router(productos.router,     dependencies=_api_key_dep)
app.include_router(pedidos.router,       dependencies=_api_key_dep)
app.include_router(eventos.router,       dependencies=_api_key_dep)
app.include_router(estadisticas.router,  dependencies=_api_key_dep)
app.include_router(direcciones.router,   dependencies=_api_key_dep)
app.include_router(catalogos.router,     dependencies=_api_key_dep)
```

El esquema `ApiKeyAuth` se registra en el OpenAPI spec para que aparezca en el botón **Authorize** de Swagger UI:

```python
from fastapi.openapi.utils import get_openapi

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(title=app.title, version=app.version,
                         description=app.description, routes=app.routes)
    schema.setdefault("components", {}).setdefault("securitySchemes", {})["ApiKeyAuth"] = {
        "type": "apiKey", "in": "header", "name": "x-api-key"
    }
    for path_item in schema.get("paths", {}).values():
        for operation in path_item.values():
            if isinstance(operation, dict):
                operation.setdefault("security", []).append({"ApiKeyAuth": []})
    app.openapi_schema = schema
    return schema

app.openapi = custom_openapi
```

**Prueba en Swagger UI:**

1. Abrir `https://<IP_VM_PUBLICA>/docs`
2. Clic en **Authorize** → campo **ApiKeyAuth** → ingresar el valor de `API_KEY`
3. Sin API Key o key incorrecta → `401 No autorizado`
4. Con API Key correcta → acceso concedido a la capa siguiente

---

### 3.2 JWT (JSON Web Token) — Autenticación post-login

Después de hacer login, el servidor devuelve un JWT firmado. Los endpoints protegidos validan este token en el header `Authorization: Bearer <token>`.

**Archivo:** `app/security/auth.py`

```python
import os
from datetime import datetime, timedelta
from jose import JWTError, jwt
from fastapi.security import HTTPBearer

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "cambia_esto_en_produccion")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8

bearer_scheme = HTTPBearer(auto_error=False)

def create_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
```

El campo `token_type` diferencia tokens de tienda (`"tienda"`) de tokens de colaboradores (`"colaborador"`), impidiendo que un usuario de tienda acceda a endpoints administrativos.

**Flujo de autenticación completa:**

```
Cliente                              Nginx (VM publica) --> API (VM privada)
  |                                          |
  |-- POST /api/user/login ----------------> |  (x-api-key requerida)
  |   { email, password }                    |-- Valida API Key
  |                                          |-- check_password_hash()
  |<-- 200 { access_token } ----------------|
  |                                          |
  |-- GET /api/user/status ----------------> |  (x-api-key + Bearer token)
  |                                          |-- Valida API Key + JWT
  |<-- 200 { user data } ------------------|
```

**Prueba en Swagger UI:**

1. `POST /api/user/login` con credenciales válidas → copiar `access_token`
2. En **Authorize** → campo **HTTPBearer** → pegar el token
3. `GET /api/user/status` → `200` con datos del usuario
4. Token inválido o expirado → `401`

---

### 3.3 Rate Limiting

Se implementó limitación de tasa de peticiones para proteger contra ataques de fuerza bruta.

**Archivo:** `app/security/rate_limit.py`

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, storage_uri="memory://")
```

**Límites configurados por endpoint:**

| Endpoint | Límite | Justificación |
|---|---|---|
| `POST /api/user/login` | 5 req/min | Bloquea fuerza bruta de contraseñas |
| `POST /api/auth/login` | 5 req/min | Idem para colaboradores |
| `POST /api/user/register` | 10 req/min | Previene creación masiva de cuentas |
| `POST /api/auth/register` | 10 req/min | Idem |
| `POST /api/user/logout` | 60 req/min | Normal |
| `GET /api/user/status` | 60 req/min | Normal |

**Prueba:** enviar más de 5 veces seguidas `POST /api/user/login` → el 6.° devuelve `429 Too Many Requests`.

---

### 3.4 Protección BOLA/IDOR

**BOLA** (Broken Object Level Authorization) ocurre cuando un usuario manipula el ID de otro en el body para acceder o modificar recursos ajenos.

**Vulnerabilidad original:**

```python
# ANTES — código vulnerable
nuevo_pedido = Pedido(id_usuario=data.user_id, ...)  # cualquier ID en el body
```

**Corrección** en `app/routers/pedidos.py`:

```python
@router.post("/pedidos/crear")
async def crear_pedido(
    data: PedidoCreate,
    current_user: dict = Depends(get_current_tienda_user),
    db: Session = Depends(get_db)
):
    user_id = int(current_user["sub"])   # siempre del JWT, nunca del body
    nuevo_pedido = Pedido(id_usuario=user_id, ...)
```

**Prueba (ataque simulado):** logueado como usuario ID 26, enviar `"user_id": 23` en el body. El pedido se crea con `id_usuario=26` en BD. El campo del body es ignorado.

---

## 4. Arquitectura de Dos Servidores (VMs Debian en VirtualBox)

### 4.1 Topología

La infraestructura se divide en dos máquinas virtuales Debian 12 en VirtualBox. Están conectadas por una **red interna** (`10.10.10.0/24`) que ningún otro dispositivo de la LAN puede alcanzar.

```
          LAN (red del salon / casa)
                      |
        [IP LAN]      |
       .──────────────+──────────────────────────.
       |  VM PUBLICA  10.10.10.1                 |
       |  Adaptadores: Puente (LAN) + Interna    |
       |                                         |
       |  [ Nginx :80/:443 ]  [ Uptime Kuma :3001]
       |       SSL + LB             monitoreo    |
       '──────────────+──────────────────────────'
                      | red interna 10.10.10.0/24
                      | (invisible desde la LAN)
       .──────────────+──────────────────────────.
       |  VM PRIVADA  10.10.10.2                 |
       |  Adaptador: Solo red interna            |
       |                                         |
       |  [ api_1 :8001 ]  [ api_2 :8002 ]      |
       |  [ postgres (sin puerto externo) ]      |
       '─────────────────────────────────────────'
```

**Regla de aislamiento:** desde cualquier dispositivo de la LAN, la IP `10.10.10.2` no responde a ping ni a ningún puerto. La única ruta de acceso es a través del servidor público.

### 4.2 Configuración de Nginx

Nginx corre en la VM pública y enruta el tráfico hacia las APIs en la VM privada.

**Archivo:** `nginx/nginx.conf`

```nginx
events { worker_connections 1024; }

http {
    # Las APIs viven en la VM privada — red interna 10.10.10.0/24
    upstream sway_api {
        server 10.10.10.2:8001;
        server 10.10.10.2:8002;
    }

    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        server_name _;

        ssl_certificate     /etc/nginx/certs/sway.crt;
        ssl_certificate_key /etc/nginx/certs/sway.key;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         HIGH:!aNULL:!MD5;

        location / {
            proxy_pass         http://sway_api;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
            proxy_read_timeout 60s;
        }
    }
}
```

### 4.3 Certificado SSL autofirmado

Se genera en la VM pública antes de levantar los contenedores:

```bash
mkdir -p nginx/certs
openssl req -x509 -newkey rsa:2048 \
  -keyout nginx/certs/sway.key \
  -out nginx/certs/sway.crt \
  -days 365 -nodes \
  -subj "/CN=sway.local/O=SWAY Conservacion Marina/C=MX"
```

Los archivos se excluyen del repositorio vía `.gitignore`. En producción se reemplazarían por un certificado de Let's Encrypt.

> El navegador mostrará advertencia de certificado no confiable. Se omite con "Proceder de todas formas" o usando `curl -k`.

### 4.4 Docker Compose — dos archivos separados

#### `docker-compose.public.yml` — VM pública (10.10.10.1)

```yaml
services:
  nginx:
    image: nginx:alpine
    container_name: sway_nginx
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro,z
      - ./nginx/certs:/etc/nginx/certs:ro,z

  monitoring:
    image: louislam/uptime-kuma:1
    container_name: sway_monitoring
    restart: always
    ports:
      - "3001:3001"
    volumes:
      - uptime_kuma_data:/app/data

volumes:
  uptime_kuma_data:
```

#### `docker-compose.private.yml` — VM privada (10.10.10.2)

```yaml
services:
  postgres:
    image: postgres:15
    container_name: sway_postgres
    restart: always
    environment:
      POSTGRES_USER: sway_app
      POSTGRES_PASSWORD: sway123
      POSTGRES_DB: sway
      POSTGRES_HOST_AUTH_METHOD: trust
    # Sin puertos expuestos — solo accesible por api_1 y api_2 internamente
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./SWAY_PostgreSQL.sql:/docker-entrypoint-initdb.d/01_init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sway_app -d sway"]
      interval: 5s
      retries: 5
      timeout: 5s

  api_1:
    build: .
    container_name: sway_api_1
    restart: on-failure
    ports:
      - "8001:8000"
    env_file: .env
    environment:
      DATABASE_URL: postgresql+psycopg://sway_app:sway123@postgres:5432/sway
    depends_on:
      postgres:
        condition: service_healthy

  api_2:
    build: .
    container_name: sway_api_2
    restart: on-failure
    ports:
      - "8002:8000"
    env_file: .env
    environment:
      DATABASE_URL: postgresql+psycopg://sway_app:sway123@postgres:5432/sway
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
```

### 4.5 Orden de despliegue

Siempre levantar primero la VM privada para que las APIs estén disponibles cuando Nginx arranque.

**En la VM privada (10.10.10.2):**

```bash
git clone <url_repo>
cd SWAY-POO
git checkout seguridad_api
cp .env.example .env
nano .env    # rellenar JWT_SECRET_KEY, API_KEY, CORS_ORIGINS

docker compose -f docker-compose.private.yml up -d --build

# Verificar
curl http://localhost:8001/
curl http://localhost:8002/
```

**En la VM pública (10.10.10.1):**

```bash
git clone <url_repo>
cd SWAY-POO
git checkout seguridad_api

# Generar certificado SSL (solo la primera vez)
mkdir -p nginx/certs
openssl req -x509 -newkey rsa:2048 \
  -keyout nginx/certs/sway.key -out nginx/certs/sway.crt \
  -days 365 -nodes -subj "/CN=sway.local/O=SWAY/C=MX"

# Verificar que la VM privada ya responde
curl http://10.10.10.2:8001/
curl http://10.10.10.2:8002/

docker compose -f docker-compose.public.yml up -d

# Probar desde la LAN
curl -k https://<IP_LAN_VM_PUBLICA>/
```

### 4.6 Prueba de aislamiento

Desde cualquier dispositivo de la LAN (host, Windows, móvil):

```bash
# Debe NO responder — VM privada no alcanzable desde la LAN
ping 10.10.10.2          # timeout / sin respuesta
curl http://10.10.10.2:8001/   # connection refused / timeout

# Debe responder — a través del servidor público
curl -k https://<IP_LAN_VM_PUBLICA>/
# {"message":"SWAY FastAPI v2.0","docs":"/docs"}
```

---

## 5. Monitoreo — Uptime Kuma

Uptime Kuma corre en la VM pública. Al estar en la misma máquina que Nginx, puede monitorear tanto el frente HTTPS como las APIs privadas directamente por la red interna.

**Acceso:** `http://<IP_LAN_VM_PUBLICA>:3001`

**Configuración:** crear cuenta de administrador en el primer acceso, luego agregar dos monitores:

| Monitor | Tipo | URL | Intervalo | Descripción |
|---|---|---|---|---|
| SWAY Frente HTTPS | HTTP(s) | `https://localhost/` | 60 s | Prueba el frente completo (Nginx + SSL + APIs) |
| SWAY API Privada | HTTP(s) | `http://10.10.10.2:8001/` | 60 s | Salud directa de la API sin pasar por Nginx |

El segundo monitor solo es posible porque Uptime Kuma tiene ruta a `10.10.10.2` por la red interna. Desde la LAN ese monitor no sería alcanzable.

---

## 6. Firewall — UFW diferenciado por servidor

Los scripts están en `scripts/` y se ejecutan con `sudo bash` en cada VM respectiva.

### 6.1 Servidor público — `scripts/ufw_public.sh`

```bash
ufw default deny incoming
ufw default allow outgoing

ufw allow 22/tcp     # SSH — administración remota
ufw allow 80/tcp     # HTTP — Nginx redirige a HTTPS (301)
ufw allow 443/tcp    # HTTPS — entrada principal de la API con SSL
ufw allow 3001/tcp   # Uptime Kuma — dashboard de monitoreo

ufw --force enable
ufw status verbose
```

Resultado esperado:

```
To           Action    From
22/tcp       ALLOW IN  Anywhere
80/tcp       ALLOW IN  Anywhere
443/tcp      ALLOW IN  Anywhere
3001/tcp     ALLOW IN  Anywhere
```

### 6.2 Servidor privado — `scripts/ufw_private.sh`

```bash
ufw default deny incoming
ufw default allow outgoing

# SSH solo desde la subred interna (no expuesto a la LAN)
ufw allow from 10.10.10.0/24 to any port 22 proto tcp

# APIs solo accesibles desde el servidor público
ufw allow from 10.10.10.1 to any port 8001 proto tcp
ufw allow from 10.10.10.1 to any port 8002 proto tcp

# postgres (5432) NO se abre al host — solo accede la red Docker interna

ufw --force enable
ufw status verbose
```

Resultado esperado:

```
To           Action    From
22/tcp       ALLOW IN  10.10.10.0/24
8001/tcp     ALLOW IN  10.10.10.1
8002/tcp     ALLOW IN  10.10.10.1
```

---

## 7. Variables de entorno

El archivo `.env` **solo es necesario en la VM privada**. El servidor público no maneja secretos de la aplicación.

```env
# Solo en el servidor privado (10.10.10.2)
DB_USER=sway_app
DB_PASSWORD=sway123
DB_NAME=sway

JWT_SECRET_KEY=<clave_hex_64_chars>
API_KEY=<clave_hex_48_chars>

# IP o dominio del servidor público para peticiones CORS desde el navegador
CORS_ORIGINS=https://<IP_LAN_VM_PUBLICA>
```

Generación de claves:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"   # JWT (64 chars)
python3 -c "import secrets; print(secrets.token_hex(24))"   # API Key (48 chars)
```

---

## 8. Resumen de requerimientos cumplidos

| Requerimiento | Implementación | Estado |
|---|---|---|
| Hasheado y encriptado | `bcrypt` vía Werkzeug en auth y colaboradores | Completo |
| Protección API con JWT | `python-jose`, tokens firmados con secret en env | Completo |
| API Key | `APIKeyHeader` en todos los routers | Completo |
| Rate Limiting | `slowapi`, límites por endpoint | Completo |
| Protección BOLA/IDOR | `user_id` extraído del JWT, ignorado en body | Completo |
| Certificado SSL | Nginx con certificado autofirmado RSA-2048 | Completo |
| Balanceador de carga | Nginx upstream round-robin entre `api_1:8001` y `api_2:8002` | Completo |
| Dos servidores | VM Debian pública (Nginx + monitoreo) y VM Debian privada (API + BD) en red interna VirtualBox | Completo |
| Monitoreo | Uptime Kuma en VM pública con dos monitores (frente HTTPS y API privada) | Completo |
| Firewall | UFW diferenciado: público (22/80/443/3001) y privado (8001/8002 solo desde 10.10.10.1) | Completo |

---

## 9. Resumen de archivos modificados / creados

| Archivo | Cambio |
|---|---|
| `app/security/auth.py` | JWT secret desde variable de entorno |
| `app/security/api_key.py` | Nuevo — dependencia `APIKeyHeader` |
| `app/security/rate_limit.py` | Nuevo — instancia compartida de `slowapi.Limiter` |
| `app/main.py` | `SlowAPIMiddleware`, `custom_openapi()`, `Security(require_api_key)` global |
| `app/routers/auth.py` | Hash de contraseñas, rate limiting, validador de fechas |
| `app/routers/colaboradores.py` | Hash de contraseñas en login, registro y cambio de password |
| `app/routers/pedidos.py` | Protección BOLA/IDOR: `user_id` desde JWT |
| `app/models/pedidos.py` | `user_id` marcado como `Optional` |
| `docker-compose.yml` | Archivado como referencia monolítica (ya no se usa en producción) |
| `docker-compose.public.yml` | Nuevo — nginx + uptime-kuma para VM pública |
| `docker-compose.private.yml` | Nuevo — api_1 + api_2 + postgres para VM privada |
| `nginx/nginx.conf` | Upstream actualizado a IPs de red interna (10.10.10.2:8001/8002) |
| `nginx/certs/sway.crt` | Certificado autofirmado generado localmente (no versionado) |
| `nginx/certs/sway.key` | Clave privada SSL generada localmente (no versionada) |
| `scripts/ufw_public.sh` | Nuevo — reglas UFW para VM pública |
| `scripts/ufw_private.sh` | Nuevo — reglas UFW para VM privada (acceso restringido por IP) |
| `.env` | Solo en VM privada (no versionado) |
| `.env.example` | Actualizado — aclara que solo aplica al servidor privado |
| `.gitignore` | Agregado `nginx/certs/` |
| `requirements.txt` | Agregado `slowapi>=0.1.9` |
