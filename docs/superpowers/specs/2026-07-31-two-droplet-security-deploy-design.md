# Diseño — Despliegue de seguridad en 2 droplets DigitalOcean

**Fecha:** 2026-07-31
**Estado:** Aprobado por usuario, listo para plan de implementación

## Contexto

El proyecto corre hoy en un único droplet DigitalOcean (`165.232.146.240`, `s-1vcpu-2gb-sfo3-01`, ya 2GB RAM) vía `docker-compose.prod.yml`: 4 contenedores (`sway_postgres`, `sway_api`, `sway_web`, `sway_nginx`), solo el puerto 80 de nginx expuesto al público. Documentado en `docs/DEPLOYMENT.md`.

Existe una rama `seguridad_api` (5 commits, no mergeada) que ya implementa: hasheo bcrypt (Werkzeug), JWT (python-jose, secret desde env), API Key global (`x-api-key` en todos los routers), rate limiting (`slowapi`), protección BOLA/IDOR en pedidos, y una arquitectura de 2 servidores — pero diseñada para 2 VMs VirtualBox con red interna `10.10.10.0/24`, monitoreo con Uptime Kuma, y balanceador nginx simple (solo la API, 2 instancias). `git merge-tree` confirma que la rama mergea limpio contra `master` (0 conflictos).

La rúbrica de evaluación exige, además de lo ya cubierto por `seguridad_api`: dos servidores (uno público, uno privado), monitoreo con Prometheus/Grafana, firewall, JWT, SSL, y **balanceador de carga cuyo reparto de tráfico sea visible en el monitoreo** (no solo "hay 2 instancias", sino demostrarlo).

Se localizó un proyecto de referencia (`Downloads/demo-files/demo - Copy`) que implementa exactamente este patrón para otro stack (FastAPI + Flask + MySQL): 2 docker-compose separados (`compose.public.yaml`/`compose.private.yaml`), HAProxy como balanceador con página de stats nativa y exporter Prometheus propio, Grafana detrás de HAProxy vía subpath, red privada `192.168.10.101`/`.102`. Este diseño adapta ese patrón al stack real de SWAY (FastAPI + Flask + React + PostgreSQL).

## Objetivo

Separar el despliegue actual en 2 droplets DigitalOcean comunicados por red privada VPC, integrar la seguridad de `seguridad_api` adaptada a esta topología, y satisfacer los 7 puntos de la rúbrica de seguridad con evidencia demostrable (no solo funcional).

## Arquitectura

```
Internet
   │
   ▼
┌─────────────────────────── Droplet PÚBLICO (nuevo, IP privada VPC .102) ───────────────────────────┐
│  HAProxy :80 (redirect→443) :443 (SSL, ACL routing) :8404 (/stats) :8405 (/metrics propio)          │
│    ├─ /api/*     → api_back (roundrobin api1:8001, api2:8002 @ .101)                                │
│    ├─ /portal/*  → nginx local (estático, web2/dist)                                                │
│    ├─ /grafana/* → grafana:3000 (local)                                                             │
│    └─ default    → flask_back (roundrobin flask1:5001, flask2:5002 @ .101)                          │
│  nginx interno (sin puerto público) — sirve web2/dist                                                │
│  Grafana :3000 (interno, expuesto solo vía HAProxy /grafana)                                         │
│  UFW: 22, 80, 443, 8404 abiertos; 8405 solo alcanzable por VPC                                       │
└────────────────────────────────────────┬──────────────────────────────────────────────────────────┘
                                          │ red privada VPC DigitalOcean (mismo datacenter, gratis)
┌─────────────────────────── Droplet PRIVADO (existente, IP privada VPC .101) ────────────────────────┐
│  postgres (red data_network, interna, sin puerto expuesto)                                           │
│  api1 :8001, api2 :8002 — FastAPI (red app_network)                                                  │
│  flask1 :5001, flask2 :5002 — web1 (red app_network)                                                 │
│  prometheus :9090 — scrapea local (cadvisor, node_exporter, postgres_exporter) +                     │
│              remoto (.102:8405, métricas de HAProxy)                                                 │
│  cadvisor, node_exporter, postgres_exporter (red monitoring_network, interna)                        │
│  UFW: SSH + 8001/8002/5001/5002 solo desde IP VPC del droplet público                                │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Componentes

### Backend de aplicación (código, portado sin cambios de `seguridad_api`)
- `app/security/api_key.py` — dependencia `require_api_key`, aplicada globalmente a todos los routers.
- `app/security/auth.py` — JWT vía `JWT_SECRET_KEY` en env, `python-jose`, expira 8h.
- `app/security/rate_limit.py` — `slowapi.Limiter`, límites por endpoint (5/min login, 10/min registro).
- Hasheo bcrypt en `auth.py`/`colaboradores.py` (Werkzeug `generate_password_hash`/`check_password_hash`).
- BOLA/IDOR en `pedidos.py` — `user_id` extraído del JWT, nunca del body.
- **Nuevo en este diseño:** endpoint `GET /health` en `app/main.py` (fuera de cualquier router, igual que `/` — sin API key, para que HAProxy pueda hacer healthcheck sin credenciales).

### HAProxy (droplet público)
- Reemplaza el nginx-balanceador simple de `seguridad_api`. Config basada en la referencia (`demo-files/haproxy/haproxy.cfg`), adaptada:
  - `frontend https_front :443` con ACLs `path_beg /api`, `path_beg /portal`, `path_beg /grafana`; default → `flask_back`.
  - `backend api_back`: roundrobin, healthcheck `GET /health` esperando 200, servers `api1 <ip_privado>:8001`, `api2 <ip_privado>:8002`.
  - `backend flask_back`: roundrobin, healthcheck `GET /` esperando 2xx/3xx, servers `flask1 <ip_privado>:5001`, `flask2 <ip_privado>:5002`.
  - `backend portal_back`: nginx local sirviendo `web2/dist`.
  - `backend grafana_back`: `grafana:3000` local.
  - `listen stats :8404` — página humana de reparto de tráfico por backend.
  - `frontend prometheus_front :8405` — expone `/metrics` propio de HAProxy vía `http-request use-service prometheus-exporter`.
- Certificado SSL: autofirmado (RSA-2048, `openssl req -x509`), sin dominio — decisión ya tomada.

### Monitoreo (droplet privado genera métricas, Grafana en público las visualiza)
- Prometheus (privado) — scrapea `cadvisor`, `node_exporter`, `postgres_exporter` locales, y `haproxy-edge` remoto (`<ip_publico>:8405/metrics`).
- `postgres_exporter` — equivalente al `mysql_exporter` de la referencia, adaptado a PostgreSQL.
- Grafana (público) — datasource apuntando al Prometheus del droplet privado vía IP VPC; dashboard mínimo con panel de peticiones por backend (evidencia de balanceo repartido) + salud de contenedores/host.
- Esto cumple simultáneamente dos líneas de la rúbrica: "monitoreo del sistema" (Prometheus/Grafana, cadvisor, node_exporter) y "balanceador de carga" demostrado con reparto visible (métricas HAProxy en Grafana + página `/stats`).

### Redes Docker (droplet privado)
- `app_network` — api1/api2/flask1/flask2, expuesta a puertos publicados.
- `data_network` (interna, sin salida a internet) — postgres + postgres_exporter.
- `monitoring_network` (interna) — cadvisor, node_exporter, postgres_exporter, prometheus.

### Firewall (UFW)
- Privado: deny incoming por defecto; permitir SSH; permitir 8001/8002/5001/5002 **solo desde la IP privada VPC del droplet público** (no desde IP pública de nadie más).
- Público: deny incoming por defecto; permitir SSH, 80, 443, 8404; **no** exponer 8405 al público (solo alcanzable por VPC desde el privado — o permitirlo solo desde IP VPC del privado).

## Flujo de datos (ejemplo: petición a la API)

```
Cliente (browser/Expo) → HTTPS 443 HAProxy (público)
  → ACL /api → backend api_back → roundrobin → api1 o api2 (privado, vía VPC)
    → require_api_key (header x-api-key) → check_password_hash / validar JWT según endpoint
    → postgres (solo alcanzable desde api1/api2 en data_network)
  ← respuesta JSON
← HAProxy reenvía al cliente
```

Cada petición queda registrada en las métricas de HAProxy (`/stats`, `/metrics`) — visible en Grafana como conteo por backend, demostrando el reparto real.

## Manejo de errores

- Healthchecks de HAProxy (`option httpchk`) sacan automáticamente de rotación cualquier instancia caída (api1/api2, flask1/flask2) sin caerse el servicio completo — mismo patrón que la prueba de tolerancia a fallos ya documentada en `seguridad_api` (parar `sway_api_1`, el frente sigue verde).
- `require_api_key` y JWT devuelven 401 con mensaje estructurado (ya implementado en `seguridad_api`, sin cambios).
- Rate limiting devuelve 429 (ya implementado, sin cambios).

## Testing / verificación (criterios de éxito para el plan de implementación)

1. Desde la LAN/internet: `curl https://<ip_publica>/api/estadisticas` responde 200 (self-signed, `-k`).
2. Desde cualquier IP que no sea la del droplet público: `curl http://<ip_privada_vpc>:8001/` → timeout/rechazado (UFW).
3. Apagar `api1` (`docker stop`): `/api/*` sigue respondiendo (HAProxy enruta 100% a `api2`), panel de HAProxy en Grafana/`\:8404/stats` muestra `api1` DOWN.
4. Enviar 20 peticiones seguidas a `/api/estadisticas`: `:8404/stats` o el dashboard de Grafana muestran el conteo repartido entre `api1`/`api2` (no 100%/0%).
5. `POST /api/user/login` 6 veces seguidas → 6.ª devuelve 429.
6. Login con password en texto plano contra `password_hash` en BD → falla (columna es hash bcrypt, no texto plano).
7. Body de un pedido con `user_id` de otro usuario → el pedido se crea con el `user_id` del JWT, no el del body.
8. Prometheus objetivo `haproxy-edge` en estado `UP` en `http://<ip_privada>:9090/targets`.
9. `docker compose -f docker-compose.private.yml ps` en droplet privado y `docker compose -f docker-compose.public.yml ps` en el público — todos los contenedores `Up`.

## Fuera de alcance

- Dominio propio / Let's Encrypt (decisión explícita: solo IP + autofirmado).
- Migración de datos existentes en el droplet actual — no aplica, el droplet actual se reutiliza tal cual como el privado.
- Redis / mysql_exporter de la referencia — no aplican al stack de SWAY (no usa Redis, usa PostgreSQL no MySQL).
- CA propia (`CA.crt`/`CA.key`) de la referencia — se mantiene el enfoque simple de un solo cert autofirmado, sin jerarquía de CA (no hay mTLS ni necesidad de firmar múltiples certs).
- Balancear PostgreSQL — solo hay una instancia de BD, no forma parte del requisito de balanceador.

## Archivos de referencia consultados

- `docs/DEPLOYMENT.md` — despliegue actual de un solo droplet.
- `docs/CLAUDE.md` — rúbrica de evaluación del PI (14 puntos, despliegue en nube era el único pendiente antes de esta sesión).
- Rama `seguridad_api` (`docs/seguridad_api.md`) — implementación de seguridad de aplicación, y primer intento de arquitectura de 2 servidores (VirtualBox, descartada aquí por infra real distinta).
- `Downloads/demo-files/demo - Copy/` — proyecto de referencia con HAProxy + Prometheus + Grafana + 2 servidores, patrón adoptado para el balanceador y el monitoreo.
