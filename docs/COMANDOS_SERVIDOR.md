# Comandos útiles — SWAY Servidor producción (2 droplets)

Arquitectura real: **droplet público** (`146.190.136.236`, VPC `10.124.0.2`) corre HAProxy + nginx-portal + Grafana. **Droplet privado** (`165.232.146.240`, VPC `10.124.0.3`) corre Postgres, api1/api2, flask1/flask2, Prometheus, node_exporter, postgres_exporter, Redis — 9 contenedores. Dominio real: `https://proyecto-sway.site` (SSL Let's Encrypt).

**El droplet privado ya no acepta SSH directo desde internet** (UFW solo permite el puerto 22 desde la IP VPC del público, `PasswordAuthentication no`). Todo acceso de gestión al privado pasa por el público como bastion.

---

## Conexión a los servidores

### Público (directo, sí acepta SSH externo)
```bash
ssh -i ~/.ssh/sway_deploy root@146.190.136.236
cd /home/sway/sway
```

### Privado (vía bastion — 2 formas)

**Opción recomendada — alias en `~/.ssh/config` (una sola vez):**
```
Host sway-privado
    HostName 10.124.0.3
    User root
    IdentityFile ~/.ssh/sway_deploy
    ProxyJump root@146.190.136.236
```
Luego:
```bash
ssh sway-privado
cd /root/sway
```

**Opción manual — sin tocar `~/.ssh/config`:**
```bash
ssh -i ~/.ssh/sway_deploy -o ProxyCommand="ssh -i ~/.ssh/sway_deploy -W %h:%p root@146.190.136.236" root@10.124.0.3
```

Directo (`ssh root@165.232.146.240`) **ya no funciona** — da timeout de red. No usar ese patrón.

---

## Estado general de contenedores

```bash
# Privado — 9 servicios (postgres, api1, api2, flask1, flask2, redis, prometheus, node_exporter, postgres_exporter)
ssh sway-privado "docker ps --format '{{.Names}}: {{.Status}}'"

# Público — 3 servicios (haproxy, nginx_portal, grafana)
ssh -i ~/.ssh/sway_deploy root@146.190.136.236 "docker ps --format '{{.Names}}: {{.Status}}'"

# Uso de RAM y CPU en tiempo real (correr dentro de cada droplet)
docker stats --no-stream
```

---

## Base de datos PostgreSQL (droplet privado)

### Acceder al psql
```bash
ssh sway-privado
docker exec -it sway_postgres psql -U sway_app -d sway
```

### Comandos útiles dentro de psql
```sql
\dt                          -- listar todas las tablas (51 reales en producción)
\q                           -- salir

SELECT * FROM usuarios ORDER BY id DESC LIMIT 1;
SELECT * FROM colaboradores ORDER BY id DESC LIMIT 5;
SELECT id, nombre_comun, nombre_cientifico FROM especies LIMIT 10;
SELECT COUNT(*) FROM usuarios;
SELECT COUNT(*) FROM colaboradores;
SELECT COUNT(*) FROM especies;
```

### Contar tablas desde fuera de psql
```bash
ssh sway-privado "docker exec sway_postgres psql -U sway_app -d sway -tAc \"SELECT count(*) FROM information_schema.tables WHERE table_schema='public'\""
```

---

## Realtime sync (WebSocket + Redis) — salud y diagnóstico

### Redis alcanzable desde ambas réplicas
```bash
ssh sway-privado "docker exec sway_api1 python -c \"import redis; print(redis.from_url('redis://redis:6379').ping())\""
ssh sway-privado "docker exec sway_api2 python -c \"import redis; print(redis.from_url('redis://redis:6379').ping())\""
```

### Memoria/salud de Redis
```bash
ssh sway-privado "docker exec sway_redis redis-cli info memory | grep -E 'used_memory_human|maxmemory_human'"
ssh sway-privado "docker exec sway_redis redis-cli ping"
```

### Ver claves de rate limiting compartido (namespace `LIMITS:*`, no colisiona con el canal pub/sub `sway:events`)
```bash
ssh sway-privado "docker exec sway_redis redis-cli --scan --pattern 'LIMITS:*'"
```

### Smoke test del endpoint WebSocket (debe dar `101 Switching Protocols`)
```bash
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" https://proyecto-sway.site/api/ws
```
Nota: `curl` deja la conexión colgada tras el upgrade (comportamiento normal de WS) — cortarla con Ctrl+C una vez visto el `101` en la respuesta.

---

## HAProxy — balanceador y stats

```bash
# Ver los backends y su reparto de tráfico (requiere password real de .env del público)
ssh -i ~/.ssh/sway_deploy root@146.190.136.236 "curl -s -u 'admin:<password>' 'http://localhost:8404/stats;csv'" | cut -d',' -f1,2,8

# Visual — abrir en navegador (usuario/password en .env del público)
http://146.190.136.236:8404/stats
```
Backends reales: `api_back` (api1/api2), `flask_back` (flask1/flask2), `portal_back`, `grafana_back`, más `stats`/`prometheus_front`.

---

## Logs en tiempo real

```bash
# Privado — todos los servicios
ssh sway-privado "cd /root/sway && docker compose -f docker-compose.private.yml logs -f"

# Solo una réplica de la API
ssh sway-privado "docker logs sway_api1 --tail 30 -f"
ssh sway-privado "docker logs sway_api2 --tail 30 -f"

# Público — HAProxy
ssh -i ~/.ssh/sway_deploy root@146.190.136.236 "docker logs sway_haproxy --tail 30 -f"

# Filtrar ruido de /health del healthcheck de HAProxy (no aporta nada al debug)
ssh sway-privado "docker logs sway_api1 --tail 200 | grep -v '/health'"
```

---

## Variables de entorno

```bash
# Confirmar que existen las variables esperadas (no imprime valores/secretos)
ssh sway-privado "cd /root/sway && grep -oE '^[A-Z_]+=' .env"
ssh -i ~/.ssh/sway_deploy root@146.190.136.236 "cd /home/sway/sway && grep -oE '^[A-Z_]+=' .env"
```

---

## Firewall (UFW) — verificar el bastion

```bash
ssh sway-privado "ufw status verbose"
ssh -i ~/.ssh/sway_deploy root@146.190.136.236 "ufw status verbose"

# Confirmar que el privado rechaza SSH directo desde fuera de la VPC (debe dar timeout)
ssh -o ConnectTimeout=8 -o BatchMode=yes root@165.232.146.240 "whoami"
```

---

## Verificar contenedores/salud de ambos droplets de una sola vez

```bash
echo "--- privado ---"; ssh sway-privado "docker ps --format '{{.Names}}: {{.Status}}'"
echo "--- publico ---"; ssh -i ~/.ssh/sway_deploy root@146.190.136.236 "docker ps --format '{{.Names}}: {{.Status}}'"
```

---

## Actualizar código en producción

### Traer los últimos cambios (cada droplet tiene su propio checkout del repo)
```bash
ssh sway-privado "cd /root/sway && git pull"
ssh -i ~/.ssh/sway_deploy root@146.190.136.236 "cd /home/sway/sway && git pull"
```

### Reconstruir y reiniciar un servicio (privado)
```bash
ssh sway-privado "cd /root/sway && docker compose -f docker-compose.private.yml up --build -d api1 api2"
```

### Reiniciar sin reconstruir (solo para cambios de .env)
```bash
ssh sway-privado "cd /root/sway && docker compose -f docker-compose.private.yml up -d --force-recreate api1 api2"
```

---

## Reinicio completo (por droplet)

```bash
# Privado — sin borrar la BD
ssh sway-privado "cd /root/sway && docker compose -f docker-compose.private.yml down && docker compose -f docker-compose.private.yml up --build -d"

# CUIDADO: esto borra la base de datos
ssh sway-privado "cd /root/sway && docker compose -f docker-compose.private.yml down -v && docker compose -f docker-compose.private.yml up --build -d"

# Público — restart de HAProxy (necesario tras cambiar haproxy.cfg, ej. certs renovados)
ssh -i ~/.ssh/sway_deploy root@146.190.136.236 "cd /home/sway/sway && haproxy -c -f haproxy/haproxy.cfg && docker compose -f docker-compose.public.yml restart haproxy"
```

---

## URLs del sistema en producción

| URL | Servicio |
|-----|---------|
| https://proyecto-sway.site/ | Portal público Flask (Web1) |
| https://proyecto-sway.site/portal/ | Portal colaboradores React (Web2) |
| https://proyecto-sway.site/api/estadisticas | JSON FastAPI (requiere `x-api-key`) |
| https://proyecto-sway.site/docs | Swagger UI |
| https://proyecto-sway.site/grafana/login | Grafana (monitoreo) |
| https://proyecto-sway.site/api/ws | WebSocket realtime sync |
| http://146.190.136.236:8404/stats | HAProxy stats (auth básica) |

---

**Llave SSH:** `~/.ssh/sway_deploy` es la única llave vigente para ambos droplets. La llave vieja `~/.ssh/sway_droplet` ya no se usa en ningún comando de este documento.
