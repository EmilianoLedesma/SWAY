# Despliegue en 2 droplets — Runbook

Este documento son pasos manuales que **el usuario ejecuta por SSH sobre los droplets reales**. No son ejecutables desde este entorno (sin acceso SSH/API de DigitalOcean) — están escritos para copiar/pegar sin adivinar nada.

## 0. Prerrequisitos
- Droplet privado: el existente (`165.232.146.240`, `sway-server`, 2GB) — ya tiene el proyecto en `/home/sway/sway` con `master` actualizado (`git pull`).
- Crear droplet público nuevo en DigitalOcean: Ubuntu 22.04, **mismo datacenter que el privado** (San Francisco 3 / `sfo3`, confirmado — el privado es `s-1vcpu-2gb-sfo3-01`), 1GB/$6 alcanza (solo corre HAProxy+nginx+Grafana). Mismo datacenter → mismo VPC por defecto (`10.124.0.0/20`, ya confirmado activo en el privado vía `ip -4 addr show`, interfaz `eth1`, IP real `10.124.0.3`).
- Al crear el droplet público, anotar su IP privada asignada (panel de DO → Networking, o `ip -4 addr show eth1` una vez creado) — es el valor real que reemplaza `10.124.0.2` en los pasos de abajo.

## 1. Droplet privado — actualizar y aplicar UFW
```bash
ssh sway@165.232.146.240
cd /home/sway/sway
git pull
docker compose -f docker-compose.prod.yml down   # baja el stack viejo de un solo droplet
```
Reemplazar `10.124.0.2` en `scripts/ufw_private.sh` y `prometheus/prometheus.yml` (campo `haproxy-edge`) por la IP privada real del droplet público (recién creado en el paso anterior), luego:
```bash
sudo bash scripts/ufw_private.sh
cp .env.example .env && chmod 600 .env
nano .env   # rellenar JWT_SECRET_KEY, API_KEY, CORS_ORIGINS=https://146.190.136.236
docker compose -f docker-compose.private.yml up --build -d
docker compose -f docker-compose.private.yml ps
```
Verificar 9 contenedores `Up`: postgres, api1, api2, flask1, flask2, postgres_exporter, node_exporter, prometheus, redis (sin cadvisor — descartado por RAM ajustada, ver Tarea 6; `redis` agregado 2026-08-04 para pub/sub de realtime sync y storage compartido de rate limiting — `mem_limit: 64m`, RAM verificada antes de agregarlo, ver `docs/PI_REQUIREMENTS_VERIFICATION.md` sección 15).

Nota UFW: `scripts/ufw_private.sh` borra explícitamente las reglas `80/tcp`, `443/tcp` y sus variantes `(v6)` que quedaron del despliegue de un solo droplet, antes de aplicar las reglas nuevas (`ufw default deny` no revierte un `allow` ya puesto). Después de correr el script, verificar con `ufw status numbered` que no sobrevivió ninguna regla `80/tcp`/`443/tcp` IPv6 residual — el `delete` de esas reglas `(v6)` puede ser un no-op según la versión de UFW instalada, así que confirmar a mano.

## 2. Droplet público — preparar y levantar
```bash
ssh root@146.190.136.236
adduser sway && usermod -aG sudo sway
rsync --archive --chown=sway:sway ~/.ssh /home/sway
su - sway
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker sway
exit && ssh sway@146.190.136.236

git clone https://github.com/TU_USUARIO/TU_REPO.git sway
cd sway
```
Reemplazar `10.124.0.3` en `haproxy/haproxy.cfg` (backends `api_back`/`flask_back`) y en `grafana/provisioning/datasources/prometheus.yml` si por algún motivo el droplet privado se recrea con otra IP (no debería — es el droplet existente, la IP ya está confirmada). `scripts/ufw_public.sh` no necesita edición — ya usa `10.124.0.3` fijo para la regla de `:8405` y el resto de sus reglas (22/80/443/8404) son abiertas por diseño, sin placeholder que rellenar.

En `haproxy/haproxy.cfg`, la sección `listen stats` trae la línea `stats auth admin:REEMPLAZAR_CON_PASSWORD_STATS` (agregada tras la revisión de seguridad de la Tarea 8) — reemplazar `REEMPLAZAR_CON_PASSWORD_STATS` por una contraseña real antes o durante el despliegue, mismo patrón que los demás placeholders `REEMPLAZAR_CON_*`.

**Importante:** el mismo valor de `API_KEY` que se acaba de definir en el `.env` del droplet privado debe reemplazar el placeholder literal `REEMPLAZAR_CON_API_KEY_PUBLICA` en estos 3 archivos: `assets/js/api-key.js`, `web2/src/api/client.js` y `MockupsSwayMobile/src/api/client.js`. Se edita acá, en el checkout del **droplet público** (`assets/` se sirve desde este droplet vía nginx-portal, editarlo en el privado no tiene efecto) — hacerlo **antes** del build de `web2` y antes de publicar la app móvil, ya que estos clientes incrustan el string literal en su bundle y un cambio posterior en `.env` no se propaga solo.

```bash
./haproxy/generate_cert.sh
mkdir -p web2/dist   # o traer el build real: scp -r web2/dist desde tu máquina
cp .env.example .env
nano .env   # GRAFANA_ADMIN_PASSWORD
sudo bash scripts/ufw_public.sh
docker compose -f docker-compose.public.yml up --build -d
docker compose -f docker-compose.public.yml ps
```
Verificar 3 contenedores `Up`: haproxy, nginx-portal, grafana.

## 3. Verificación end-to-end (desde cualquier máquina fuera de la VPC)
```bash
curl -k -s -o /dev/null -w "%{http_code}\n" https://146.190.136.236/api/estadisticas -H "x-api-key: <API_KEY>"   # 200
curl -k -s https://146.190.136.236/docs | grep -o "<title>.*</title>"                                             # Swagger
curl -k -s -o /dev/null -w "%{http_code}\n" https://146.190.136.236/portal/                                       # 200
curl -k -s -o /dev/null -w "%{http_code}\n" https://146.190.136.236/                                               # 200, Flask
curl -k -s https://146.190.136.236:8404/stats | grep -o "<title>.*</title>"                                        # stats HAProxy
curl -k -s https://146.190.136.236/grafana/login                                                                   # Grafana
```
Desde el droplet privado, confirmar que las IPs directas no responden desde fuera de la VPC:
```bash
curl -m 3 http://<IP_PUBLICA_de_internet>:8001/   # debe fallar (UFW bloquea, solo VPC pasa)
```

## 4. Prueba de balanceo visible (evidencia para la rúbrica)
```bash
for i in $(seq 1 20); do curl -sk https://146.190.136.236/api/estadisticas -H "x-api-key: <API_KEY>" -o /dev/null; done
```
Abrir `https://146.190.136.236:8404/stats` — la fila `api1` y `api2` dentro de `api_back` deben mostrar sesiones/peticiones repartidas entre ambas, no todo en una. Mismo resultado esperado en el panel de Grafana "Peticiones por backend (HAProxy)".

## 5. Reconfigurar clientes con la nueva URL pública
- `MockupsSwayMobile/src/api/client.js`: `API_HOST` → `https://146.190.136.236`.
- `web2/vite.config.js` (proxy de dev) y build de producción: sin cambios si sigue siendo mismo-origen tras el build (`/api` relativo).
- `assets/js/main.js` / templates Flask: siguen usando rutas relativas `/api/...`, sin cambios — HAProxy ya enruta.
