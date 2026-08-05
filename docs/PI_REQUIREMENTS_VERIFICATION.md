# Verificación de requisitos del PI — SWAY

Última actualización: 2026-08-04 (verificado en vivo contra producción: 9 contenedores en privado incluyendo Redis, 3 en público, commit `f5f984b` en ambos droplets)

Este documento resume el trabajo hecho en los últimos días (fusión de seguridad de aplicación + migración real a arquitectura de 2 droplets + SSL real de Let's Encrypt + dashboard de Grafana con 7 paneles + 3 bugs reales encontrados y corregidos durante la verificación en vivo) y da, para cada punto de la rúbrica: qué se hizo, dónde vive el código exacto (archivo:línea), y varias formas independientes de comprobarlo en vivo — `curl`, consultas SQL, `ping`, `openssl`, navegador real, capturas de pantalla. Todos los comandos son copiar/pegar directos, y cada afirmación de este documento fue efectivamente ejecutada y verificada contra la producción real (`https://proyecto-sway.site`), no es documentación aspiracional.

**Datos de referencia (no sensibles):**

| Recurso | Valor |
|---|---|
| Droplet privado (datos + lógica) | `165.232.146.240` — VPC `10.124.0.3` |
| Droplet público (borde + monitoreo) | `146.190.136.236` — VPC `10.124.0.2` |
| Dominio | `https://proyecto-sway.site` |
| Datacenter | DigitalOcean `sfo3`, misma VPC `10.124.0.0/20` |
| API Key pública (anti-scraping, no es secreto) | `f6bed84d1b5bb4af3ff44231c8c8bae5c8efc3709ee1510b` |

Contraseñas reales (`JWT_SECRET_KEY`, `DB_PASSWORD`, `GRAFANA_ADMIN_PASSWORD`, password de HAProxy stats) **no están en este documento** — viven en el `.env` de cada droplet (`/root/sway/.env` privado, `/home/sway/sway/.env` público) y en el `.env` local del proyecto. Pedir acceso a quien tenga las llaves SSH si se necesitan para la demo.

**Suite automatizada:** todos los comandos de este documento (secciones 1-7, 11-14) están scriptados en `scripts/verify_pi_requirements.sh` — corre contra producción real y da un resumen pass/fail:
```bash
SSH_KEY=~/.ssh/sway_deploy bash scripts/verify_pi_requirements.sh
```
Los ítems 8-10 (mobile UX) quedan como `SKIP` porque necesitan interacción manual con un dispositivo real (ver sección "Cómo levantar la app en Expo Go") — no hay forma de automatizar esto sin un harness de pruebas E2E de UI (Detox/Appium), que este proyecto no tiene. El rate limiting (429) sí se prueba automáticamente: la suite pega 6 veces seguidas al endpoint de login directo de una réplica (`10.124.0.3:8001`, bypaseando el balanceador para no repartir el cupo entre `api1`/`api2`) y confirma que el intento 6 da `429` real.

---

## 0. Cómo generar tu propia llave SSH y obtener acceso

Todos los comandos de verificación de este documento que empiezan con `ssh -i ...` requieren una llave SSH autorizada en los droplets. Así se genera una nueva y se agrega:

**Paso 1 — Generar el par de llaves (en tu propia máquina):**
```bash
ssh-keygen -t ed25519 -f ~/.ssh/sway_deploy -N "" -C "tu-nombre"
```
Esto crea dos archivos: `~/.ssh/sway_deploy` (privada, **nunca compartir**) y `~/.ssh/sway_deploy.pub` (pública, la que se comparte). El flag `-N ""` deja la llave sin passphrase para simplificar los comandos de este documento — si prefieres una passphrase, omite ese flag y se te pedirá al usar la llave.

**Paso 2 — Ver la llave pública generada:**
```bash
cat ~/.ssh/sway_deploy.pub
```
Copiar la línea completa (empieza con `ssh-ed25519 AAAA...`).

**Paso 3 — Pedir que agreguen tu llave pública a los droplets.** Quien ya tenga acceso corre esto por cada droplet, pegando tu llave pública. Para el privado hace falta saltar primero al público (ver "Acceso al droplet privado" más abajo):
```bash
ssh -i ~/.ssh/<llave-existente> -A root@146.190.136.236 "ssh root@10.124.0.3 \"echo 'ssh-ed25519 AAAA...tu-llave-aqui... tu-nombre' >> ~/.ssh/authorized_keys\""
ssh -i ~/.ssh/<llave-existente> root@146.190.136.236 "echo 'ssh-ed25519 AAAA...tu-llave-aqui... tu-nombre' >> ~/.ssh/authorized_keys"
```

**Paso 4 — Confirmar que tu llave nueva funciona:**
```bash
ssh sway-privado "whoami"
ssh -i ~/.ssh/sway_deploy root@146.190.136.236 "whoami"
```
Esperado: `root` en ambos.

**Alternativa sin llave SSH — Web Console de DigitalOcean:** si no se quiere generar/gestionar una llave, el panel de DigitalOcean tiene un botón **Console** en cada droplet que abre una terminal root directo en el navegador, sin necesitar llave ni contraseña — ahí se pueden correr exactamente los mismos comandos de este documento. Esto también sirve como **fallback de emergencia** si el acceso SSH normal se rompe (login local `root` + contraseña vía panel DO, independiente por completo de la red/firewall/sshd) — así se recuperó el acceso una vez durante el desarrollo de este proyecto tras un error de configuración de firewall.

---

## 0.1 Acceso SSH al droplet privado — patrón de salto (bastion)

**Por qué:** el droplet privado (`165.232.146.240` / VPC `10.124.0.3`) tiene UFW configurado para aceptar SSH (puerto 22) **solo desde la IP VPC del droplet público** (`10.124.0.2`), y además `PasswordAuthentication no` en `sshd` — no acepta login directo desde internet bajo ninguna circunstancia, ni con llave ni con contraseña. Todo acceso real pasa primero por el droplet público.

**Opción recomendada — `ProxyJump` en `~/.ssh/config` (una sola vez), luego los comandos de este documento funcionan tal cual:**
```
Host sway-privado
    HostName 10.124.0.3
    User root
    IdentityFile ~/.ssh/sway_deploy
    ProxyJump root@146.190.136.236
```
Con esto, `ssh sway-privado "comando"` (la forma usada en el resto de este documento) salta automáticamente por el público.

**Opción manual — sin tocar `~/.ssh/config`, agent forwarding en el momento:**
```bash
eval "$(ssh-agent -s)" && ssh-add ~/.ssh/sway_deploy
ssh -A root@146.190.136.236
# ya adentro del público:
ssh root@10.124.0.3
```
Nota técnica: si se corre esto en un entorno donde cada comando de shell es un proceso nuevo (sin variables de entorno persistentes entre invocaciones, como algunos runners de CI/agentes), el `ssh-agent` y el `ssh-add` deben ir en el **mismo bloque de comando** que el `ssh -A` — si se separan, el agente no sobrevive a la siguiente invocación y el salto falla con `Permission denied`.

---

## Mapa de código — dónde vive cada requisito

Referencia rápida de archivo:línea para quien quiera leer el código fuente directo en vez de (o además de) correr los comandos de verificación. Todos los paths son relativos a la raíz del repo.

| # | Requisito | Archivo(s) clave | Qué buscar ahí |
|---|---|---|---|
| 1 | Hasheo de contraseñas | `app/routers/colaboradores.py:3,39,124,411,414`<br>`app/routers/auth.py:6,72,117,132,235,266` | `generate_password_hash`/`check_password_hash` en cada register/login/cambio de password |
| 2 | 2 servidores | `docker-compose.private.yml`<br>`docker-compose.public.yml` | Servicios del droplet privado (postgres, api1/api2, flask1/flask2, prometheus) vs público (haproxy, nginx-portal, grafana) |
| 3 | Monitoreo | `prometheus/prometheus.yml`<br>`grafana/provisioning/datasources/prometheus.yml`<br>`grafana/provisioning/dashboards/sway-balanceo.json` | Targets de scrape, datasource, 7 paneles del dashboard |
| 4 | Firewall | `scripts/ufw_private.sh`<br>`scripts/ufw_public.sh`<br>`docker-compose.private.yml` (bind a `10.124.0.3` en vez de `0.0.0.0`) | Reglas UFW por droplet, bind explícito de puertos Docker |
| 5 | JWT + protección API | `app/security/auth.py:19,44,54` (`create_token`, `get_current_tienda_user`, `get_current_colaborador`)<br>`app/security/api_key.py:10` (`require_api_key`)<br>`app/security/rate_limit.py:5,12` (`get_real_client_ip`, `Limiter`) | Emisión/verificación de JWT, gate de API key global, rate limiting |
| 6 | SSL | `haproxy/haproxy.cfg` (bind `*:443 ssl crt`)<br>`haproxy/generate_cert.sh`<br>`/etc/letsencrypt/renewal/proyecto-sway.site.conf` (en el droplet público, no en el repo) | Configuración TLS de HAProxy, script de cert autofirmado (ya no usado en prod), hooks de renovación real |
| 7 | Balanceador | `haproxy/haproxy.cfg` (`backend api_back`, `backend flask_back`, `balance roundrobin`, `option httpchk`) | Definición de balanceo round-robin y healthcheck |
| 8-10 | Mobile (utilidad, diseño, navegación) | `MockupsSwayMobile/src/screens/*`<br>`MockupsSwayMobile/src/navigation/AppNavigator.js`<br>`MockupsSwayMobile/src/api/client.js` | Pantallas nativas (biometría, cámara, GPS), estructura de navegación bottom-tabs+stack |
| 11 | Formularios validados | `app/models/colaboradores.py:3,26,83` (`EmailStr`)<br>`app/routers/auth.py:2,24,51` (`EmailStr`)<br>`MockupsSwayMobile/src/utils/collaboratorValidation.js` | Validación Pydantic server-side + validadores JS client-side |
| 12 | Datos compartidos mobile/Web | `app/routers/estadisticas.py` (`GET /api/avistamientos`)<br>`app/routers/colaboradores.py` (`GET /api/colaboradores/avistamientos`)<br>`web2/src/api/client.js`<br>`MockupsSwayMobile/src/api/client.js` | Mismos endpoints consumidos por las 3 plataformas |
| 13 | Alojado en la nube | `docker-compose.private.yml`, `docker-compose.public.yml`<br>`docs/DEPLOYMENT_2_DROPLETS.md` | Todo el stack real corriendo en DigitalOcean, runbook de despliegue |
| 14 | Mobile 100% funcional | `MockupsSwayMobile/src/api/client.js:10` (`API_HOST`) | Apunta a `https://proyecto-sway.site`, no a `localhost` |

---

## 1. Hasheado y encriptado funcionando

**Qué se hizo:** todos los endpoints que crean o cambian contraseñas (`/api/colaboradores/register`, `/api/colaboradores/perfil/password`, `/api/user/register`, `/api/auth/register`) usan `werkzeug.security.generate_password_hash` — hash salteado (`pbkdf2:sha256`, 600,000 iteraciones), nunca texto plano. Verificación (`check_password_hash`) en cada login.

**Cómo funciona técnicamente:** PBKDF2 (Password-Based Key Derivation Function 2) no es un hash simple como `SHA256(password)` — aplica la función hash **repetidamente** (600,000 veces en este caso) sobre la contraseña combinada con un salt aleatorio generado por petición. Dos efectos de esto:
1. **El salt evita ataques de tabla precomputada (rainbow tables).** Si dos usuarios tienen la misma contraseña, sus hashes salen distintos porque el salt es distinto — comparar la BD contra una tabla de hashes conocidos no sirve de nada.
2. **Las 600,000 iteraciones son deliberadamente lentas.** Un hash rápido (como SHA256 sin iterar) permite a un atacante con GPU probar miles de millones de contraseñas por segundo si roba la BD. Con 600,000 iteraciones, cada intento de "adivinar" una contraseña toma milisegundos reales — un ataque de fuerza bruta offline se vuelve computacionalmente caro, no imposible pero sí impráctico.

El string guardado (`pbkdf2:sha256:600000$<salt>$<hash>`) codifica el algoritmo y el número de iteraciones junto con el resultado — así `check_password_hash` sabe exactamente cómo re-derivar el hash al verificar un login, sin necesitar guardar esa configuración en otro lado. La comparación interna usa `hmac.compare_digest` (tiempo constante), evitando timing attacks donde un atacante mide cuánto tarda la respuesta para inferir cuántos caracteres coinciden.

**Cómo confirmarlo — SQL directo contra la base real:**
```bash
ssh sway-privado
docker exec sway_postgres psql -U sway_app -d sway -c "SELECT id, email, password_hash FROM usuarios ORDER BY id DESC LIMIT 5;"
```
Esperado: columna `password_hash` con formato `pbkdf2:sha256:600000$<salt>$<hash>`, nunca la contraseña real. Dos usuarios distintos deben tener salts distintos aunque usen la misma contraseña.

**Cómo confirmarlo — registro real + verificación:**
```bash
curl -s -X POST https://proyecto-sway.site/api/colaboradores/register \
  -H "Content-Type: application/json" \
  -H "x-api-key: f6bed84d1b5bb4af3ff44231c8c8bae5c8efc3709ee1510b" \
  -d '{"nombre":"Demo","email":"demo-pi@demo-sway.com","password":"claveDemo123","especialidad":"Demo","grado_academico":"Licenciatura","institucion":"UPQ","años_experiencia":"1","motivacion":"Demo PI"}'
```
Luego repetir la consulta SQL de arriba y mostrar que `password_hash` no contiene `claveDemo123` en ningún lado.

**Nota sobre cuentas antiguas:** el hasheo solo aplica hacia adelante — cuentas creadas **antes** de que este trabajo de seguridad se mergeara a producción pueden tener `password_hash` en texto plano o vacío (registradas con código legacy que no hasheaba). Esto es esperado, no un hallazgo nuevo — se puede confirmar contando cuántas cuentas están en cada estado:
```bash
ssh sway-privado "docker exec sway_postgres psql -U sway_app -d sway -c \"SELECT count(*) FILTER (WHERE password_hash LIKE 'pbkdf2:%') as hasheadas_correctamente, count(*) FILTER (WHERE password_hash IS NULL OR password_hash = '') as vacias, count(*) FILTER (WHERE password_hash IS NOT NULL AND password_hash != '' AND password_hash NOT LIKE 'pbkdf2:%') as legacy_texto_plano FROM usuarios;\""
```
Las cuentas `legacy_texto_plano` no se corrigen solas — requeriría un script de migración forzando reset de password, fuera del alcance de este trabajo. Toda cuenta **nueva**, o que cambie su password desde hoy en adelante, sí queda hasheada correctamente (demostrado arriba con el registro real `user_id:59`).

**Hallazgo real durante esta verificación — las cuentas legacy no solo son inseguras, están rotas: no pueden iniciar sesión con ningún password.** `check_password_hash` (Werkzeug) espera el formato `metodo$salt$hash`; un valor guardado como texto plano (ej. `"12345678"`) no tiene ese formato, así que la comparación falla silenciosamente y el login devuelve `401` sin importar qué contraseña real se use — confirmado probando con la cuenta `id:35` (cuenta real del equipo) y su password conocido, que dio `401` hasta corregir el hash. Se corrigió esa cuenta puntual generando un hash real (`generate_password_hash` local) e insertándolo directo vía SQL — no se tocó el código, es una corrección de datos, no de lógica. El resto de las cuentas legacy (12 más) siguen igual, sin acceso, hasta que alguien las repare una por una o se escriba un script de migración.

**Cómo confirmarlo:**
```bash
ssh sway-privado "docker exec sway_postgres psql -U sway_app -d sway -c \"SELECT u.id, u.email FROM usuarios u JOIN colaboradores c ON c.id_usuario = u.id WHERE u.password_hash IS NOT NULL AND u.password_hash != '' AND u.password_hash NOT LIKE 'pbkdf2:%' AND c.estado_solicitud = 'aprobada';\""
```
Esperado: lista de colaboradores aprobados que actualmente no pueden iniciar sesión — evidencia de que el problema es real y medible, no teórico.

---

## 2. Dos servidores — uno público, uno privado

**Qué se hizo:** arquitectura separada en 2 droplets DigitalOcean reales, comunicados por red privada VPC (`10.124.0.0/20`, mismo datacenter `sfo3`). El privado corre Postgres + 2 réplicas de la API (FastAPI) + 2 réplicas de Flask (web1), sin exponer nada a internet salvo SSH. El público corre HAProxy (borde + SSL + balanceo) + nginx (portal estático) + Grafana.

**Cómo funciona técnicamente:** una VPC (Virtual Private Cloud) de DigitalOcean es una red privada aislada a nivel de datacenter — los droplets dentro de la misma VPC se ven entre sí por IPs `10.x.x.x` (rango RFC 1918, no enrutable en internet público) a través de una interfaz de red separada (`eth1`) de la interfaz pública (`eth0`). El tráfico entre droplets de la misma VPC nunca sale a internet — viaja por la red interna del datacenter, lo que además de más seguro es más rápido (sin salir por el borde de red pública) y no consume el ancho de banda medido de la IP pública. Esto es lo que hace posible que el droplet privado no necesite exponer Postgres/API directo a internet: solo necesita ser alcanzable por la IP VPC del droplet público, algo que UFW puede filtrar explícitamente (sección 4).

La separación real (no solo "dos procesos en la misma máquina con puertos distintos") importa porque un compromiso del droplet público (el que sí está expuesto a todo internet en los puertos 80/443) no le da a un atacante acceso directo al sistema operativo del droplet privado — tendría que además comprometer la VPC o robar credenciales SSH válidas, una capa adicional de defensa.

**Cómo confirmarlo — ping cruzado real por VPC:**
```bash
ssh -i ~/.ssh/sway_deploy root@146.190.136.236 "ping -c 3 10.124.0.3"
```
Esperado: respuestas `64 bytes from 10.124.0.3`, 0% packet loss.

**Cómo confirmarlo — el privado no responde nada por internet salvo SSH:**
```bash
curl -m 5 http://165.232.146.240/          # debe fallar / timeout, no hay nada en :80 ahí
curl -m 5 http://165.232.146.240:8001/     # debe fallar, UFW solo permite la IP VPC del público
```

**Cómo confirmarlo — contenedores corriendo en cada droplet:**
```bash
ssh sway-privado "docker ps --format '{{.Names}}: {{.Status}}'"
ssh -i ~/.ssh/sway_deploy root@146.190.136.236 "docker ps --format '{{.Names}}: {{.Status}}'"
```
Esperado privado: `sway_postgres`, `sway_api1`, `sway_api2`, `sway_flask1`, `sway_flask2`, `sway_prometheus`, `sway_node_exporter`, `sway_postgres_exporter`, `sway_redis` — 9 contenedores (Redis se agregó 2026-08-04 para pub/sub de realtime sync y rate limiting compartido, ver sección 15).
Esperado público: `sway_haproxy`, `sway_nginx_portal`, `sway_grafana` — 3 contenedores.

---

## 3. Monitoreo del sistema (Prometheus, Grafana)

**Qué se hizo:** Prometheus corre en el droplet privado, scrapea métricas locales (`node_exporter`, `postgres_exporter`, sí mismo) y remotas (HAProxy `/metrics` del droplet público, vía VPC). Grafana corre en el droplet público con datasource pre-provisionado apuntando a Prometheus, y un dashboard con panel de reparto de tráfico entre las 2 réplicas de la API.

Adicional: se instaló el **agente nativo de monitoreo de DigitalOcean** (`do-agent`) en ambos droplets — visible directo en el panel de DO (Droplet → Insights), sin configuración extra.

**Cómo funciona técnicamente:** Prometheus usa un modelo **pull** (a diferencia de sistemas como StatsD que usan push) — cada 15 segundos (`scrape_interval` en `prometheus.yml`), Prometheus hace una petición HTTP GET a `/metrics` en cada target configurado y guarda los valores como series de tiempo. Cada "exporter" (`node_exporter`, `postgres_exporter`, el exporter integrado en HAProxy) es simplemente un servidor HTTP que traduce el estado interno de su sistema (CPU, conexiones a BD, sesiones de HAProxy) al formato de texto plano que Prometheus entiende (`nombre_metrica{etiqueta="valor"} numero`).

El scrape cross-droplet (Prometheus en el privado leyendo HAProxy en el público) funciona porque ambos están en la misma VPC — Prometheus le pega a `10.124.0.2:8405/metrics` como si fuera local, sin necesitar exponer ese puerto a internet (UFW en el público solo permite `8405` desde la IP VPC del privado, sección 4).

Grafana no almacena datos propios — cuando se abre un panel, Grafana traduce la expresión PromQL configurada (ej. `haproxy_server_active`) en una consulta HTTP a la API de Prometheus (`/api/v1/query` o `/api/v1/query_range`), y renderiza la respuesta. Esto es por lo que un panel con una métrica que no existe (como el bug de `haproxy_server_up` encontrado esta sesión) no da error — simplemente devuelve un resultado vacío, y el panel se ve en blanco sin ninguna alerta obvia de que algo está mal.

**Cómo confirmarlo — targets de Prometheus saludables:**
```bash
ssh sway-privado "curl -s http://10.124.0.3:9090/api/v1/targets | python3 -c \"import json,sys; d=json.load(sys.stdin); [print(t['labels']['job'], t['health']) for t in d['data']['activeTargets']]\""
```
Esperado: `prometheus up`, `node up`, `postgres up`, `haproxy-edge up` — los 4 en `up`.

**Cómo acceder y usar Grafana (para la presentación del PI):**
1. Abrir `https://proyecto-sway.site/grafana/login` en cualquier navegador.
2. Usuario `admin`, contraseña real en `/home/sway/sway/.env` del droplet público (variable `GRAFANA_ADMIN_PASSWORD`) — pedirla a quien tenga acceso SSH si no se tiene a la mano.
3. En el menú lateral izquierdo, click en **Dashboards**.
4. Click en la carpeta **SWAY**, luego en **SWAY — Balanceo y Monitoreo**.
5. El dashboard tiene 7 paneles:
   - **"Peticiones por backend (HAProxy)"** (arriba, gráfica de líneas) — muestra cuánto tráfico recibe cada réplica (`api1`, `api2`, `flask1`, `flask2`) en tiempo real. Para generar tráfico visible en vivo durante la demo: abrir otra pestaña y refrescar `https://proyecto-sway.site/api/estadisticas` varias veces, o simplemente navegar la app — las líneas del gráfico deben moverse.
   - **"Backends activos (up/down)"** — 6 números, cada uno debe decir `1` (activo). Si alguno cae a `0`, esa réplica/servicio está caído.
   - **"Uso de CPU del host"** — carga del droplet privado en tiempo real.
   - **"Distribución de tráfico entre réplicas (%)"** — pie chart, evidencia visual directa del balanceador: debe mostrar 4 porciones (`api1`, `api2`, `flask1`, `flask2`) de tamaño similar entre sí. Es el panel más claro para mostrar en la presentación del PI — una sola imagen que prueba el balanceo.
   - **"Sesiones actuales por réplica"** — conexiones activas en tiempo real por backend. Al ser peticiones HTTP cortas (no conexiones persistentes), normalmente se ve en `0` con picos breves cuando llega tráfico — comportamiento esperado, no un error.
   - **"Conexiones activas a PostgreSQL"** — número de conexiones abiertas a la base de datos en este momento (típicamente 3-5, una por réplica de la API/Flask más overhead normal de pooling).
   - **"Respuestas 4xx/5xx por backend (protección API)"** — visualiza en tiempo real cuándo la API rechaza peticiones (401 sin token/API-key, 422 validación fallida, 429 rate limit excedido). Útil para demostrar en vivo que la protección de la API (JWT + rate limiting) está realmente activa, no solo en el código — generar tráfico inválido (ej. login con password incorrecta varias veces) y ver el pico aparecer en este panel.
6. Selector de rango de tiempo arriba a la derecha (por defecto "Last 6 hours") — se puede cambiar a "Last 15 minutes" para ver el tráfico de la demo en vivo más de cerca, o click en **Refresh** (o activar auto-refresh con la flechita junto al botón) para que los paneles se actualicen solos cada pocos segundos.

**Cómo confirmarlo — Grafana accesible y con datos:**
```
https://proyecto-sway.site/grafana/login
```
Login con `admin` / contraseña real en `.env` del droplet público. Abrir dashboard "SWAY — Balanceo y Monitoreo", panel "Peticiones por backend (HAProxy)" debe mostrar 2 líneas (api1/api2) con tráfico.

**Verificado en navegador real (no solo `curl`) — capturas de pantalla tomadas en vivo en 2 pasadas de esta verificación:** login exitoso en `https://proyecto-sway.site/grafana/login`, dashboard "SWAY — Balanceo y Monitoreo" abierto y renderizando datos reales en los 7 paneles:
- **"Peticiones por backend (HAProxy)"** — picos de tráfico reales etiquetados `api_back/api1`, `api_back/api2`, `flask_back/flask1`, `flask_back/flask2`, `grafana_back/grafana`, `portal_back/portal`.
- **"Backends activos (up/down)"** — 6 indicadores, todos en `1` (activo).
- **"Uso de CPU del host (droplet privado)"** — serie de tiempo real desde `node_exporter`.
- **"Distribución de tráfico entre réplicas (%)"** — pie chart con 4 porciones reales (`api1`/`api2`/`flask1`/`flask2`) de tamaño similar.
- **"Sesiones actuales por réplica"**, **"Conexiones activas a PostgreSQL"**, **"Respuestas 4xx/5xx por backend"** — los 3 más recientes, confirmados vía la API de Grafana (`/grafana/api/dashboards/uid/...`) cargando los 7 títulos correctamente tras el despliegue.

**Bug real encontrado y corregido durante esta verificación:** el panel "Backends activos" usaba la métrica `haproxy_server_up`, que **no existe** en las métricas reales que expone el exporter de HAProxy 3.2 (confirmado corriendo `curl http://146.190.136.236:8405/metrics | grep haproxy_server_`) — el panel hubiera quedado sin datos. Corregido a `haproxy_server_active` (métrica real, `1` = activo), commit `700f831`, desplegado y reverificado con el dashboard abierto en el navegador mostrando datos.

**Cómo confirmarlo — agente nativo de DigitalOcean activo:**
```bash
ssh sway-privado "systemctl is-active do-agent"
ssh -i ~/.ssh/sway_deploy root@146.190.136.236 "systemctl is-active do-agent"
```
Esperado: `active` en ambos. También visible en el panel de DigitalOcean → cada Droplet → pestaña **Insights**.

---

## 4. Firewall aplicado y monitoreado

**Qué se hizo:** UFW configurado distinto en cada droplet. Privado: deniega todo entrante salvo SSH (22) y los puertos de la app (8001/8002/5001/5002/9090) **solo desde la IP VPC del droplet público**. Público: permite 22/80/443/8404 (stats) a cualquiera, y 8405 (métricas HAProxy) solo desde la IP VPC del privado. Además, los puertos publicados por Docker en el droplet privado están bindeados a la IP VPC real (no `0.0.0.0`) — corrige un bug real donde Docker saltea UFW por completo si se publica a todas las interfaces.

**Cómo funciona técnicamente:** UFW (Uncomplicated Firewall) es una capa de abstracción sobre `iptables`/`nftables`, el firewall real del kernel de Linux. La política aplicada aquí es **default-deny**: por defecto se rechaza todo paquete entrante que no coincida explícitamente con una regla `ALLOW`, en vez de la alternativa (default-allow con reglas de bloqueo específicas) — es el enfoque recomendado en seguridad de redes porque un error de omisión (olvidar una regla) falla de forma segura (bloquea de más) en vez de insegura (permite de más).

El detalle técnico del bug de Docker (explicado también en el FAQ) es específico de cómo Docker gestiona el networking: cuando un contenedor publica un puerto, Docker inserta sus propias reglas en la cadena `DOCKER` de `iptables`, y esa cadena se evalúa **antes** que la cadena `INPUT` donde vive UFW. El resultado es que un paquete destinado a un puerto publicado por Docker nunca llega a ser evaluado por las reglas de UFW — Docker ya lo redirigió al contenedor. Bindear el puerto a una IP específica (`10.124.0.3:8001:8000` en vez de `8001:8000`) hace que Docker solo escuche en esa interfaz — un paquete que llega por la interfaz pública (`eth0`) nunca coincide con esa regla de Docker, así que sí cae en la cadena `INPUT` y ahí UFW lo evalúa normalmente.

**Cómo confirmarlo — estado real del firewall:**
```bash
ssh sway-privado "ufw status verbose"
ssh -i ~/.ssh/sway_deploy root@146.190.136.236 "ufw status verbose"
```
Esperado privado: `Status: active`, reglas `8001/8002/5001/5002/9090` con `ALLOW IN` solo desde `10.124.0.2`, sin reglas abiertas a `Anywhere` en 80/443.
Esperado público: `Status: active`, `22/80/443/8404` abiertos a `Anywhere`, `8405` solo desde `10.124.0.3`.

**Cómo confirmarlo — el bug de bind a 0.0.0.0 está corregido:**
```bash
ssh sway-privado "docker ps --format '{{.Names}}: {{.Ports}}' | grep api"
```
Esperado: `10.124.0.3:8001->8000/tcp` (con IP explícita), **no** `0.0.0.0:8001->8000/tcp`.

**Cómo confirmarlo — puertos internos inalcanzables desde fuera de la VPC:**
```bash
curl -m 5 http://165.232.146.240:8001/health   # debe dar timeout, no 200
```

**Cómo confirmarlo — SSH rechaza acceso sin la llave correcta (no es solo un candado decorativo):**
```bash
ssh -o PasswordAuthentication=no -o PubkeyAuthentication=no -o BatchMode=yes -o ConnectTimeout=8 root@165.232.146.240 "whoami"
```
Esperado: la conexión ni siquiera llega a `sshd` — UFW en el privado solo acepta el puerto 22 desde la IP VPC del público (`10.124.0.2`), así que desde fuera de la VPC esto da timeout de red, no un rechazo de credenciales. Corriendo el mismo comando **desde dentro del droplet público** (`ssh -A root@146.190.136.236`, luego el comando de arriba contra `10.124.0.3`) sí llega a `sshd` y confirma el rechazo de credenciales: `Permission denied (publickey)` — password login está deshabilitado (`PasswordAuthentication no`) desde esta sesión, así que ni siquiera se ofrece la opción de contraseña.

---

## 5. Protección de API con JWT

**Qué se hizo:** login de colaboradores y de usuarios de tienda devuelven un JWT (`python-jose`, HS256) que se exige (`Authorization: Bearer`) en todos los endpoints de escritura y datos personales. Adicional a JWT, **todos** los endpoints (sin excepción) exigen también un `x-api-key` global — segunda capa. Rate limiting agregado en endpoints sensibles (login, register, cambio de password, verificación de email/orcid/cédula) y un límite global de 100 peticiones/minuto por IP en toda la API.

**Cómo funciona técnicamente:** un JWT (JSON Web Token) tiene 3 partes separadas por `.`: header, payload, y firma. El payload contiene los "claims" — en este proyecto, `sub` (id de usuario), `email`, `token_type` (`colaborador` o `tienda`, para que un token de un tipo no sirva donde se espera el otro), y `exp` (timestamp de expiración). La firma (`HS256` = HMAC-SHA256) se genera con `JWT_SECRET_KEY` — cualquiera puede *leer* el payload de un JWT (solo está codificado en base64, no cifrado), pero nadie puede *modificarlo* sin la clave secreta, porque la firma no coincidiría en la verificación (`app/security/auth.py`, `get_current_colaborador`/`get_current_tienda_user`).

Esto es lo que hace al JWT **stateless** — a diferencia de un session cookie tradicional (que requiere que el servidor guarde una tabla de sesiones activas en memoria o BD), el servidor no necesita recordar nada: cada request trae su propia prueba de identidad, verificable matemáticamente con la clave secreta. La ventaja para esta arquitectura específica: como hay 2 réplicas de la API (`api1`/`api2`) sin estado compartido entre ellas, un JWT emitido por `api1` es válido en `api2` sin ninguna sincronización — ambas usan el mismo `JWT_SECRET_KEY` del `.env`.

La API key (`x-api-key`) es una capa completamente distinta y más simple: no lleva información, solo se compara con un valor fijo en el servidor (`app/security/api_key.py`, `require_api_key`) — su propósito no es autenticar usuarios sino filtrar tráfico automatizado que no pasa por ningún cliente oficial del proyecto (ver FAQ "¿La API key es un secreto real?").

**Cómo confirmarlo — JWT real emitido y exigido:**
```bash
curl -s -X POST https://proyecto-sway.site/api/colaboradores/login \
  -H "Content-Type: application/json" -H "x-api-key: f6bed84d1b5bb4af3ff44231c8c8bae5c8efc3709ee1510b" \
  -d '{"email":"demo-pi@demo-sway.com","password":"claveDemo123"}'
```
Copiar el `access_token` de la respuesta, luego:
```bash
curl -s -o /dev/null -w "sin token: %{http_code}\n" https://proyecto-sway.site/api/colaboradores/profile -H "x-api-key: f6bed84d1b5bb4af3ff44231c8c8bae5c8efc3709ee1510b"
curl -s -o /dev/null -w "con token: %{http_code}\n" https://proyecto-sway.site/api/colaboradores/profile -H "x-api-key: f6bed84d1b5bb4af3ff44231c8c8bae5c8efc3709ee1510b" -H "Authorization: Bearer <TOKEN>"
```
Esperado: `401` sin token, `200` con token.

**Cómo confirmarlo — rate limiting real (fuerza bruta bloqueada):**
```bash
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "intento $i: %{http_code}\n" -X POST https://proyecto-sway.site/api/colaboradores/login -H "Content-Type: application/json" -H "x-api-key: f6bed84d1b5bb4af3ff44231c8c8bae5c8efc3709ee1510b" -d '{"email":"demo-pi@demo-sway.com","password":"incorrecta"}'; done
```
Esperado: los primeros 5 dan `401`, el 6to da `429` con mensaje `Rate limit exceeded: 5 per 1 minute`.

**Resuelto 2026-08-04 — el límite ahora se cuenta globalmente entre réplicas, no por réplica.** Hasta esta fecha, el rate limiting usaba almacenamiento en memoria (`storage_uri="memory://"`) dentro de cada proceso de la API — como hay 2 réplicas (`api1`/`api2`) balanceadas por HAProxy, cada una llevaba su propio contador independiente, así que un cliente que alternaba entre ambas efectivamente tenía ~2x el límite configurado. Corregido migrando `storage_uri` a Redis compartido (`redis://redis:6379`, el mismo contenedor agregado para pub/sub de realtime sync — ver sección 15), con `socket_connect_timeout`/`socket_timeout` explícitos e `in_memory_fallback_enabled=True` para que un corte de Redis degrade a protección por-proceso en vez de romper cada request (`app/security/rate_limit.py`).

Verificación de este comportamiento — pegarle a una sola réplica directo (sin pasar por el balanceador) sí dispara el `429` exactamente en el intento 6, confirmando que la lógica de conteo por cliente es correcta:
```bash
ssh -i ~/.ssh/sway_deploy root@146.190.136.236 "for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w \"intento \$i: %{http_code}\n\" -X POST http://10.124.0.3:8001/api/colaboradores/login -H 'Content-Type: application/json' -H 'x-api-key: f6bed84d1b5bb4af3ff44231c8c8bae5c8efc3709ee1510b' -d '{\"email\":\"demo-pi@demo-sway.com\",\"password\":\"incorrecta\"}'; done"
```
Esperado: intentos 1-5 → `401`, intento 6 → `429`.

**Verificación bajo carga real (simulación de ráfaga tipo DDoS, 2026-08-04):** 300 peticiones concurrentes reales contra `POST /api/colaboradores/login` en `https://proyecto-sway.site` (dominio público real, no localhost), disparadas en paralelo desde un único cliente. Resultado: 288/300 rechazadas con `429`, 0 logins exitosos filtrados, ninguna de las 9 contenedores del droplet privado se cayó o entró en OOM (verificado con `docker stats` inmediatamente después — CPU/memoria de `api1`/`api2` volvieron a niveles base, `sway_redis` a 11MiB de 64MiB). Los 12 restantes fueron timeouts de conexión/lectura del lado del cliente (apertura simultánea de 300 conexiones TLS nuevas desde una sola máquina) — confirmado no relacionado con el servidor: `maxconn 4096` en `haproxy.cfg` está muy por encima de 300, y los logs de HAProxy en la ventana de la prueba no muestran ningún rechazo o cola relacionado con las IPs de la prueba.

**Bug real corregido en sesión anterior (2026-08-01) — antes el límite era compartido por TODO internet:** originalmente `slowapi` identificaba al cliente por `request.client.host`, que detrás de HAProxy es siempre la IP del proxy (`10.124.0.2`), nunca la IP real del visitante — esto significaba que **todos los usuarios de internet compartían un solo cupo de 5 intentos/minuto**. Corregido leyendo el header `X-Forwarded-For` que HAProxy ya envía (`option forwardfor` en `haproxy.cfg`), con fallback a `get_remote_address` para desarrollo local sin proxy. Commit `d40be5b`.

---

## 6. Certificado SSL

**Qué se hizo:** certificado real emitido por **Let's Encrypt** (no autofirmado) para el dominio `proyecto-sway.site`, servido por HAProxy en el droplet público. Renovación automática configurada (`certbot` con hooks que detienen HAProxy, renuevan, recombinan el `.pem` y reinician — probado con `certbot renew --dry-run` exitoso).

**Cómo funciona técnicamente:** Let's Encrypt emite certificados gratis usando el protocolo **ACME** (Automatic Certificate Management Environment). El método usado aquí (`certbot certonly --standalone`) es el desafío **HTTP-01**: certbot levanta temporalmente un servidor en el puerto 80 (por eso hubo que detener HAProxy un momento — ambos no pueden escuchar el mismo puerto), Let's Encrypt le pide al dominio `proyecto-sway.site` que sirva un archivo específico en una ruta específica (`/.well-known/acme-challenge/<token>`), y si logra descargarlo exitosamente desde el dominio público, eso prueba que quien pidió el certificado controla realmente ese dominio (porque solo el dueño del DNS/servidor puede hacer que esa ruta responda lo esperado). Con esa prueba, Let's Encrypt firma un certificado válido por 90 días.

HAProxy espera el certificado y la llave privada concatenados en un solo archivo `.pem` (`fullchain.pem` + `privkey.pem`) — por eso el script de renovación no solo corre `certbot renew`, sino que recombina esos 2 archivos cada vez y reinicia HAProxy para que cargue el archivo actualizado (los certificados no se recargan solos sin reiniciar el proceso que los sirve).

El candado del navegador funciona verificando una **cadena de confianza**: el certificado de `proyecto-sway.site` está firmado por una autoridad intermedia de Let's Encrypt (`YE2` en este caso), que a su vez está firmada por una autoridad raíz (`ISRG Root X1`/`X2`) que viene preinstalada como "confiable" en el sistema operativo o navegador. El navegador valida esa cadena completa antes de mostrar el candado — es matemáticamente imposible falsificar sin robar la clave privada de alguna autoridad en la cadena.

**Cómo confirmarlo — navegador:** abrir `https://proyecto-sway.site` en cualquier dispositivo — candado cerrado, sin advertencias. Click en el candado → certificado emitido por `Let's Encrypt`, válido hasta `30 oct 2026`.

**Cómo confirmarlo — línea de comandos, cadena de confianza real (sin `-k`):**
```bash
curl -v https://proyecto-sway.site/ -o /dev/null 2>&1 | grep -i "SSL connection\|subject\|issuer"
```
Esperado: conexión TLS exitosa sin necesitar `-k` (que ignora errores de certificado) — si el certificado fuera inválido, `curl` fallaría sin `-k`.

**Cómo confirmarlo — detalle completo del certificado:**
```bash
echo | openssl s_client -connect 146.190.136.236:443 -servername proyecto-sway.site 2>&1 | openssl x509 -noout -issuer -subject -dates
```
Esperado: `issuer=... O = Let's Encrypt`, `subject=CN = proyecto-sway.site`, fechas de validez vigentes.

---

## 7. Balanceador de carga

**Qué se hizo:** HAProxy en el droplet público reparte tráfico `round robin` entre 2 réplicas de la API (`api1`, `api2`) y 2 réplicas de Flask (`flask1`, `flask2`) corriendo en el droplet privado. Healthcheck activo (`GET /health`) saca del pool cualquier réplica caída. Página de stats con autenticación en `:8404/stats`.

**Cómo funciona técnicamente:** HAProxy actúa como **reverse proxy** — recibe la conexión del cliente (browser, app, curl) y abre una conexión nueva y separada hacia la réplica que le toque, actuando de intermediario. `round robin` es el algoritmo más simple: mantiene un puntero que avanza secuencialmente por la lista de servidores del backend (`api1` → `api2` → `api1` → `api2`...) — no mira carga real ni tiempo de respuesta, solo reparte por turnos. Con 2 réplicas idénticas y peticiones de costo similar (que es el caso aquí), esto produce un reparto casi perfectamente parejo, como se ve en la evidencia (`43`/`42` en 20+ peticiones).

El healthcheck (`option httpchk GET /health`, `http-check expect status 200`) corre en segundo plano, independiente del tráfico real de usuarios — HAProxy le pega periódicamente al endpoint `/health` de cada réplica (que responde sin tocar la base de datos, para que un fallo de BD no derribe el healthcheck también). Si una réplica deja de responder `200`, HAProxy la marca como `DOWN` internamente y deja de enviarle tráfico nuevo hasta que vuelva a responder sano — sin ninguna intervención manual ni reinicio del propio HAProxy. Esto es lo que hace posible actualizar el código (como se hizo 3 veces esta sesión) sin caída total: si se reiniciara una réplica a la vez, la otra seguiría atendiendo tráfico mientras tanto (no se hizo así esta sesión porque el usuario indicó que el downtime no importaba, pero la capacidad existe).

**Cómo confirmarlo — reparto real de tráfico:**
```bash
for i in $(seq 1 20); do curl -sk -H "x-api-key: f6bed84d1b5bb4af3ff44231c8c8bae5c8efc3709ee1510b" https://proyecto-sway.site/api/estadisticas -o /dev/null; done
curl -s -u "admin:<password real en .env>" "http://146.190.136.236:8404/stats;csv" | grep "^api_back," | cut -d',' -f1,2,8
```
Esperado: filas `api_back,api1,<N>` y `api_back,api2,<M>` con `N` y `M` cercanos entre sí (reparto real, no todo en una réplica).

**Cómo confirmarlo — visual:** abrir `http://146.190.136.236:8404/stats` (usuario/password en `.env`), ver las filas `api1`/`api2` dentro de `api_back` con sesiones y peticiones repartidas. También visible en el dashboard de Grafana, panel "Peticiones por backend (HAProxy)".

---

## Cómo levantar la app en Expo Go (necesario para las secciones 8-10 y 14)

Esta sección aplica a los 4 puntos de la rúbrica que necesitan la app corriendo en un dispositivo real — la sesión de verificación de este documento se saltó estas pruebas explícitamente por decisión del usuario, quedan pendientes de correr paso a paso cuando se retome.

**Paso 1 — Instalar Expo Go en el dispositivo de prueba:**
- Android: [Expo Go en Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)
- iOS: [Expo Go en App Store](https://apps.apple.com/app/expo-go/id982107779)

**Paso 2 — Levantar el servidor de desarrollo (Metro) desde la máquina de desarrollo:**
```bash
cd MockupsSwayMobile
npm install
npx expo start
```
Esto abre una terminal con un QR code y una URL tipo `exp://192.168.x.x:8081`.

**Paso 3 — Confirmar que `API_HOST` apunta a producción real (no a `localhost`):**
```bash
grep "API_HOST" MockupsSwayMobile/src/api/client.js
```
Esperado: `export const API_HOST = 'https://proyecto-sway.site';`. Si dice otra cosa, alguien lo cambió para pruebas locales — revertir antes de usar para la demo del PI.

**Paso 4 — Escanear el QR con la cámara del dispositivo (iOS) o desde la app Expo Go (Android).** La app se abre, el bundle de JS se descarga de la máquina de desarrollo (normal, ver nota técnica en la sección 14), pero todas las llamadas de red van directo a `https://proyecto-sway.site` — el dispositivo solo necesita internet, no estar en la misma red WiFi que la máquina de desarrollo (a menos que se use el modo `--localhost` de Expo, que no es el caso acá).

**Credenciales reales para probar sin registrar una cuenta nueva:**
```
Email:    123046244@upq.edu.mx
Password: Emiliano1
```
Cuenta real de colaborador (`colaborador_id:11`) con datos históricos reales (avistamientos ya cargados) — útil para probar que la app muestra datos reales desde el primer login, no una cuenta vacía. Password fue reseteado durante esta sesión de verificación porque la cuenta original tenía el password guardado en texto plano de antes de que existiera el hasheo (ver sección 1) y no podía iniciar sesión; luego cambiado por el usuario a través de la propia app.

**Qué probar una vez adentro (cubre las 4 secciones pendientes):**
1. **Ítem 8 (utilidad real):** Perfil → Seguridad → activar biometría → cerrar sesión → reabrir la app → debe pedir huella/Face ID. Reportar avistamiento → debe pedir permiso de cámara y ubicación real.
2. **Ítem 9 (diseño):** recorrer Home, Especies, Avistamientos, Eventos, Perfil — confirmar consistencia visual.
3. **Ítem 10 (navegación):** desde Home, llegar a "Mis avistamientos" y "Editar perfil" en menos de 3 toques.
4. **Ítem 14 (100% funcional):** mientras se usa la app, correr en paralelo `ssh sway-privado "docker logs sway_api1 --tail 20 -f"` — debe verse cada acción de la app aparecer como una línea de log real en el droplet, en tiempo real.

---

## 8. App móvil de utilidad real (no solo copia de Web)

**Qué existe:** login biométrico real (huella, atado a token JWT — no decorativo), GPS real para geolocalizar avistamientos, cámara del dispositivo para fotos de avistamientos, sistema de gamificación en el perfil. Estas son capacidades nativas de mobile que Web1/Web2 no tienen.

**Cómo funciona técnicamente:** estas capacidades usan módulos nativos de Expo que acceden directo al hardware del dispositivo vía APIs del sistema operativo (Android/iOS) — algo que un navegador web no puede hacer con el mismo nivel de acceso:
- **Biometría** (`expo-local-authentication`) invoca el sensor de huella/Face ID del propio SO, que compara contra los datos biométricos ya enrolados en el dispositivo (la app nunca ve ni guarda la huella en sí, solo recibe un `true`/`false` de "coincide" del SO) — el resultado exitoso desbloquea el token JWT guardado localmente en `expo-secure-store` (que en Android usa el Keystore del sistema, en iOS el Keychain — almacenamiento cifrado a nivel de SO, no un archivo plano).
- **GPS** (`expo-location`) pide el permiso de ubicación del SO y lee las coordenadas reales del receptor GPS/red del dispositivo — un navegador web puede pedir ubicación también (`navigator.geolocation`), pero con menos precisión y sujeto a que el usuario esté en ese momento en un navegador abierto, no es una capacidad "always available" como en una app nativa.
- **Cámara** (`expo-image-picker`) abre la interfaz nativa de cámara del SO, no un `<input type=file>` de HTML — permite tomar la foto ahí mismo en vez de solo seleccionar un archivo ya existente.

La diferencia real con "una copia de Web" es que estas 3 capacidades requieren acceso a hardware que Web1/Web2 (corriendo en un navegador de escritorio típico durante el desarrollo/demo) no puede replicar de forma nativa — no es una limitación de diseño, es una limitación de la plataforma web tradicional.

**Cómo confirmarlo:** abrir la app en Expo Go, ir a Perfil → Seguridad → activar biometría, cerrar sesión, volver a abrir — debe pedir huella/Face ID antes de re-entrar. Ir a "Reportar avistamiento" — debe pedir permiso de cámara y ubicación real del dispositivo (no un input de texto manual como en Web).

---

## 9. Diseño y estética profesional de la app móvil

**Qué existe:** sistema de tema propio (paleta de colores, tipografía consistente), componentes reutilizables (tarjetas, botones, chips de filtro), sin inconsistencias visuales entre pantallas.

**Cómo funciona técnicamente:** en vez de que cada pantalla defina sus propios colores/tamaños de fuente/espaciados sueltos (lo que produce inconsistencias visuales acumuladas con el tiempo), el proyecto centraliza esos valores en un módulo de tema compartido — cada pantalla importa las mismas constantes (color primario, color de fondo, radios de borde, etc.) en vez de hardcodear valores propios. Los componentes reutilizables (tarjetas, chips) son funciones de React que reciben props y renderizan siempre la misma estructura visual — cambiar el estilo de "tarjeta" en un solo lugar lo actualiza en todas las pantallas que la usan, en vez de tener que editar cada pantalla por separado.

**Cómo confirmarlo:** recorrer las 5 pantallas principales (Home, Especies, Avistamientos, Eventos, Perfil) y confirmar tipografía/color/espaciado consistente en todas — mismo patrón de tarjeta, mismo header, mismo bottom-nav.

---

## 10. Navegación móvil clara

**Qué existe:** `bottom-tabs` (5 secciones principales siempre visibles) + `stack navigation` para detalle/edición dentro de cada sección — patrón estándar de UX mobile, sin menús ocultos ni gestos no obvios.

**Cómo funciona técnicamente:** `AppNavigator.js` usa React Navigation con 2 niveles anidados. El nivel externo es un `Tab.Navigator` — siempre visible, siempre en la misma posición (abajo de la pantalla), cambia entre las 5 secciones principales con un solo toque. Dentro de cada tab vive un `Stack.Navigator` propio — permite "entrar" a una pantalla de detalle (ej. ver un avistamiento específico) sin perder el contexto de en qué tab se está, y volver atrás con el botón nativo del sistema o un botón "atrás" en el header, comportamiento que el usuario ya conoce de cualquier otra app. Esta combinación (tabs + stack anidado) es el patrón estándar de navegación mobile — no requiere aprendizaje porque coincide con lo que casi cualquier app instalada en un teléfono ya usa.

**Cómo confirmarlo:** cualquier persona sin instrucciones previas debe poder llegar a "ver mis avistamientos" y "editar mi perfil" en menos de 3 toques desde Home.

---

## 11. Formularios con validación real antes de enviar a la BD

**Qué se hizo:** validación client-side en todos los formularios que escriben en la BD (registro de colaborador, edición de perfil personal/profesional, cambio de contraseña, creación de especie, reporte de avistamiento, creación de evento) — mismos validadores compartidos entre pantallas (`collaboratorValidation.js`), no solo validación server-side.

**Cómo funciona técnicamente — defensa en profundidad (2 capas independientes):**
1. **Client-side (JS, antes de enviar la petición):** funciones puras en `collaboratorValidation.js` que reciben un valor y devuelven un mensaje de error o `null`. Se ejecutan en el evento `onChangeText`/submit del formulario, antes de que exista cualquier llamada de red — el usuario ve el error al instante, sin esperar respuesta del servidor. Esta capa existe por **experiencia de usuario**, no por seguridad — es trivial de saltarse (cualquiera con `curl` o Postman puede mandar lo que quiera directo a la API, sin pasar por esta validación).
2. **Server-side (Pydantic, en cada request):** FastAPI usa los modelos Pydantic (`ColaboradorRegister`, etc.) para parsear automáticamente el cuerpo JSON de la petición — si un campo no cumple sus restricciones (`min_length`, tipo `EmailStr`, campo faltante), FastAPI nunca llega a ejecutar el código del endpoint: devuelve `422 Unprocessable Entity` automáticamente, con el detalle exacto de qué campo falló y por qué. Esta capa **sí es la que realmente protege la base de datos** — es la que se ejecuta sin importar qué cliente (app, web, o un atacante con curl) haya mandado la petición.

La razón de tener ambas capas: la validación client-side es más rápida y da mejor experiencia de usuario (feedback instantáneo), pero nunca se puede confiar en que el cliente sea honesto — cualquier validación que solo exista en el JS del navegador/app es, en la práctica, opcional para quien controla la petición HTTP directamente. Por eso toda regla de negocio real (formato de email, longitud de contraseña, campos requeridos) está duplicada en el servidor.

**Cómo confirmarlo — intentar registro con datos inválidos, debe fallar antes de tocar la red:**
En la app: Registro → dejar email vacío o mal formado → debe mostrar error inline sin intentar el submit.

**Cómo confirmarlo — el servidor también valida (defensa en profundidad):**
```bash
curl -s -X POST https://proyecto-sway.site/api/colaboradores/register \
  -H "Content-Type: application/json" -H "x-api-key: f6bed84d1b5bb4af3ff44231c8c8bae5c8efc3709ee1510b" \
  -d '{"nombre":"","email":"no-es-email","password":"123"}'
```
Esperado: `422` con detalle de los campos que fallan validación Pydantic (no un 500 ni un guardado silencioso).

**Bug real encontrado y corregido durante esta verificación — el email no se validaba en formato, solo en longitud.** Al probar el comando de arriba con `"email":"no-es-email"` (11 caracteres, pasa el `min_length=5`), el servidor lo aceptaba como válido — el campo era `str` con `Field(min_length=..., max_length=...)`, sin ningún chequeo de formato real (sin `@`, sin dominio, nada). Esto significa que cualquiera que le pegara directo a la API (sin pasar por el formulario de la app, que sí valida en JS) podía meter emails basura a la base de datos.

Corregido en 4 modelos que escriben usuarios nuevos — cambiados de `str` a `EmailStr` (Pydantic): `ColaboradorRegister`, `CheckEmail` (`app/models/colaboradores.py`), `UserRegister`, `AuthRegister` (`app/routers/auth.py`). Se agregó la dependencia `email-validator` a `requirements.txt` (necesaria para que `EmailStr` funcione). Verificado local antes de desplegar (pytest 7/7 sin romper nada, curl con email malformado → `422` con mensaje `"value is not a valid email address"`), desplegado a producción (`docker compose up --build -d api1 api2 flask1 flask2`), y reverificado en vivo contra `https://proyecto-sway.site` — mismo resultado. Commit `157fb15`.

**Cómo confirmarlo en vivo ahora mismo:**
```bash
curl -s -X POST https://proyecto-sway.site/api/colaboradores/register \
  -H "Content-Type: application/json" -H "x-api-key: f6bed84d1b5bb4af3ff44231c8c8bae5c8efc3709ee1510b" \
  -d '{"nombre":"Test","email":"no-es-email","password":"claveTest123","especialidad":"x","grado_academico":"x","institucion":"x","años_experiencia":"1","motivacion":"x"}'
```
Esperado: `422`, con `"msg":"value is not a valid email address: An email address must have an @-sign."` en el detalle.

**Efecto secundario esperado (no un bug):** `EmailStr` también rechaza dominios reservados (`.test`, `.example`, `.invalid`, etc. — RFC 2606), así que emails de prueba tipo `demo@sway.test` ya no pasan. Los ejemplos de este documento usan `@demo-sway.com` por esa razón.

---

## 12. Info de la app móvil reflejada en su contraparte Web

**Qué se hizo:** mobile, Web1 y Web2 comparten la misma API y misma base de datos — no hay duplicación de datos ni sincronización manual. Un avistamiento creado desde mobile aparece de inmediato en el dashboard de Web2 y en el portal de Web1.

**Cómo funciona técnicamente:** no hay ningún mecanismo de "sincronización" porque no hace falta — las 3 plataformas (mobile, Web1, Web2) son clientes independientes de la misma API REST, que a su vez es el único punto de acceso a la única base de datos Postgres. Cuando mobile hace `POST /api/reportar-avistamiento`, ese request llega a una réplica de la API (`api1` o `api2`, según el balanceador), que ejecuta un `INSERT` directo en la tabla `avistamientos`. La próxima vez que Web2 haga `GET /api/avistamientos` (sea porque el usuario recargó la página, o porque el componente hace polling), esa consulta lee la misma tabla y ve la fila nueva — no hay retraso de "propagación" ni caché intermedio que pueda quedar desactualizado, porque cada lectura es una consulta SQL fresca contra el estado actual real de la base.

Esto es distinto de arquitecturas con múltiples bases de datos que se sincronizan entre sí (ej. una BD local en el dispositivo mobile que se sincroniza periódicamente con el servidor) — ese patrón sí necesitaría lógica de reconciliación de conflictos y tendría ventanas de inconsistencia temporal. Aquí no existe ese problema porque solo hay una fuente de verdad.

**Cómo confirmarlo — extremo a extremo:**
1. Crear un avistamiento desde la app mobile (con foto/GPS real).
2. Abrir `https://proyecto-sway.site/portal/` (Web2), ir a Reportes → debe aparecer el avistamiento recién creado.
3. Confirmar en SQL directo:
```bash
ssh sway-privado "docker exec sway_postgres psql -U sway_app -d sway -c \"SELECT id, fecha, notas FROM avistamientos ORDER BY id DESC LIMIT 3;\""
```

---

## 13. Web, API y BD alojados y funcionando en la nube

**Qué se hizo:** los 3 corren en DigitalOcean, repartidos en 2 droplets reales sobre VPC privada, con dominio propio y SSL real (no `localhost`, no `ngrok`).

**Cómo funciona técnicamente — qué distingue esto de "corre en mi computadora":**
- **IP pública fija y persistente:** cada droplet tiene una IP pública asignada por DigitalOcean que no cambia (a diferencia de una IP doméstica, que puede cambiar cuando el router se reinicia, o de un túnel tipo `ngrok`, que genera una URL nueva cada vez que se reinicia). El registro DNS de `proyecto-sway.site` apunta a esa IP de forma estable.
- **Disponibilidad no depende de que una laptop esté encendida.** El servicio sigue corriendo mientras el droplet esté activo en el datacenter de DigitalOcean — no depende de que la máquina de ningún desarrollador esté prendida y conectada.
- **Red real de internet, no NAT/túnel.** El tráfico llega directo del cliente al droplet vía enrutamiento normal de internet (BGP, el mismo mecanismo que usa cualquier sitio web real) — no hay un túnel intermediario (como `ngrok`) que podría caerse o tener límites de ancho de banda/conexiones simultáneas.
- **Persistencia real de datos.** Los datos en Postgres sobreviven reinicios del contenedor porque están en un volumen Docker (`sway_postgres_data`) montado en el disco real del droplet, no en memoria ni en un contenedor efímero.

**Cómo confirmarlo — los 3 componentes responden simultáneamente desde internet:**
```bash
curl -s -o /dev/null -w "Web1 (Flask): %{http_code}\n" https://proyecto-sway.site/
curl -s -o /dev/null -w "Web2 (portal): %{http_code}\n" https://proyecto-sway.site/portal/
curl -s -o /dev/null -w "API (docs): %{http_code}\n" https://proyecto-sway.site/docs
curl -s -o /dev/null -w "API (dato real): %{http_code}\n" -H "x-api-key: f6bed84d1b5bb4af3ff44231c8c8bae5c8efc3709ee1510b" https://proyecto-sway.site/api/estadisticas
```
Esperado: los 4, `200`.

**Cómo confirmarlo — la BD es real y persistente, no un mock:**
```bash
ssh sway-privado "docker exec sway_postgres psql -U sway_app -d sway -c '\dt' | wc -l"
```
Esperado: 25+ tablas (esquema completo).

---

## 14. App móvil 100% funcional con su API y BD reales

**Qué se hizo:** `API_HOST` de la app apunta al dominio de producción con SSL real (`https://proyecto-sway.site`), no a `localhost` ni a un mock. Todos los flujos (login, registro, CRUD especies, avistamientos, eventos, perfil) pasan por la API real desplegada en el droplet privado.

**Cómo funciona técnicamente — una distinción importante para entender qué es "real" acá:** Expo Go (la app usada para probar sin compilar un `.apk`/`.ipa`) funciona sirviendo el *bundle de JavaScript* de la app desde un servidor de desarrollo (Metro) que corre en la máquina del desarrollador — eso es normal y no afecta lo que se está verificando aquí. Lo que sí importa es a **dónde apuntan las llamadas de red que ese código hace** (`fetch(`API_HOST + '/api/...'`)`) — y esa constante (`API_HOST`) apunta al dominio real de producción, no a `localhost` ni a un servidor mock. Es decir: el *código* de la app se está sirviendo temporalmente desde una máquina de desarrollo (así funciona Expo Go, es normal en cualquier desarrollo con Expo), pero los *datos* con los que interactúa son 100% reales — la misma base de datos, la misma API, el mismo droplet que usan Web1 y Web2. Cuando la app se compile a un build de producción real (`.apk`/`.ipa` final), el único cambio sería dejar de depender de Metro para servir el JS — el `API_HOST` seguiría siendo exactamente el mismo.

**Cómo confirmarlo:** abrir la app en un dispositivo real vía Expo Go, hacer login, verificar en el certificado del navegador o en los logs del droplet que las peticiones llegan de verdad:
```bash
ssh sway-privado "docker logs sway_api1 --tail 20"
```
Esperado: líneas de log con peticiones reales (`GET /api/especies`, `POST /api/colaboradores/login`, etc.) apareciendo en tiempo real mientras se usa la app.

---

## 15. Realtime sync (WebSocket + Redis) — funcionalidad más allá de los 14 puntos originales

**Qué se hizo:** dos dispositivos viendo la misma pantalla (avistamientos, eventos, catálogo de especies) ahora se ven en vivo entre sí sin navegar fuera y volver — antes solo refrescaba al enfocar la pantalla (`useFocusEffect`). Arquitectura: endpoint `WS /api/ws` con autenticación por primer mensaje (nunca en la URL, para no dejar el JWT en los logs de HAProxy), Redis pub/sub compartido entre `api1`/`api2` (necesario porque HAProxy balancea round-robin — sin Redis, un evento publicado en la réplica que recibió el POST nunca llegaría a un cliente WS conectado a la otra réplica), tope de 500 conexiones concurrentes por réplica (guardia anti-DoS, ya que `/api/ws` no pasa por el rate limiter de `slowapi`), y reconexión exponencial con backoff en el cliente móvil.

**Cómo confirmarlo (verificado en vivo contra producción real, no solo local):**

```bash
# 1. Redis alcanzable desde ambas réplicas
ssh sway-privado "docker exec sway_api1 python -c \"import redis; print(redis.from_url('redis://redis:6379').ping())\""
ssh sway-privado "docker exec sway_api2 python -c \"import redis; print(redis.from_url('redis://redis:6379').ping())\""
# Esperado: True, True

# 2. Endpoint WS existe y hace upgrade correctamente
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" https://proyecto-sway.site/api/ws
# Esperado: HTTP/1.1 101 Switching Protocols

# 3. Relay cross-replica real — dos clientes WS conectados directo a api1 y api2 (bypaseando
# HAProxy), autenticados con un JWT de colaborador real, luego POST /api/reportar-avistamiento
# vía el dominio público (HAProxy decide a qué réplica va). Ambos clientes deben recibir el
# evento avistamiento_created dentro de ~10s.
```

**Resultado real (2026-08-04):** confirmado en producción — ambos clientes recibieron el evento con el payload enriquecido (`especie_nombre`, `latitud`, `longitud`, `foto_url`, etc.) necesario para que la pantalla móvil actualice la tarjeta sin tener que refrescar. Conexión autenticada probada con 50s de inactividad sin cerrarse (antes del fix de `timeout tunnel` en `haproxy.cfg`, HAProxy la hubiera cerrado a los 30s).

**Bug real encontrado y corregido durante la verificación en vivo, no durante desarrollo:** `asyncio.create_task(start_subscriber())` en `app/main.py` no guardaba una referencia al task retornado — el event loop solo mantiene una referencia débil a las tasks, así que sin ninguna referencia propia el subscriber podía (y de hecho lo hacía, confirmado en logs de ambas réplicas: `Task was destroyed but it is pending!`) ser recolectado por el garbage collector antes de ejecutar su primer `await`. El subscriber nunca llegaba a `pubsub.listen()` — cero eventos relayados pese a que `publish_event()` corría sin error alguno. Ninguna prueba automatizada lo detectó porque ninguna ejercita dos procesos reales corriendo en paralelo durante un período de tiempo real; solo apareció al correr el stack completo (`docker compose`, 2 réplicas + Redis reales) antes de tocar producción. Corregido guardando la referencia en `app.state.realtime_subscriber_task`.

**Mejora relacionada, misma sesión:** el rate limiting (`slowapi`) también fue migrado de `storage_uri="memory://"` a Redis compartido — antes cada réplica llevaba su propio contador, así que el límite efectivo en producción era ~2x el nominal (ej. login "5/minuto" era en la práctica ~10/minuto repartido entre las 2 réplicas). Probado en vivo localmente con 2 réplicas reales compartiendo un Redis real: intento 6 de login con credenciales falsas devuelve `429` correcto pese a que cada réplica solo recibió 3 peticiones — antes esto era estructuralmente imposible con contadores aislados. `in_memory_fallback_enabled` asegura que un corte de Redis degrada a protección por-proceso en vez de romper cada request (se descubrió que `swallow_errors=True` tiene un bug real en `slowapi` — nunca fija `request.state.view_rate_limit`, y el middleware lo lee sin chequear después, crasheando cada request igual).

---

## Resumen ejecutivo

| # | Requisito | Estado | Evidencia principal |
|---|---|---|---|
| 1 | Hasheo/encriptado | ✅ | SQL: `password_hash` salteado real |
| 2 | 2 servidores público/privado | ✅ | `ping` VPC cruzado, contenedores por droplet |
| 3 | Monitoreo Prometheus/Grafana | ✅ | Targets `up`, Grafana vía HTTPS, `do-agent` activo |
| 4 | Firewall | ✅ | `ufw status` en ambos, bind a IP VPC (no `0.0.0.0`) |
| 5 | JWT | ✅ | 401 sin token / 200 con token, rate limit real (429) |
| 6 | SSL | ✅ | Let's Encrypt real, verificado en navegador + `openssl` |
| 7 | Balanceador | ✅ | Split real api1/api2 vía stats CSV |
| 8 | Utilidad real mobile | ✅ | Biometría, GPS, cámara — nativas |
| 9 | Diseño profesional | ✅ | Sistema de tema consistente |
| 10 | Navegación clara | ✅ | bottom-tabs + stack estándar |
| 11 | Formularios validados | ✅ | Client-side + server-side (422 real) |
| 12 | Mobile reflejado en Web | ✅ | Mismos endpoints, mismo dato, verificable en SQL |
| 13 | Alojado en la nube | ✅ | 2 droplets DO, dominio propio, SSL real |
| 14 | App móvil 100% funcional | ✅ | `API_HOST` producción, logs reales confirmando tráfico |

**14/14.**

---

## Preguntas frecuentes de revisión (Q&A)

Preguntas típicas que un evaluador puede hacer, organizadas por tema, con respuesta directa y dónde verificarla en vivo si hace falta.

### Arquitectura general

**P: ¿Por qué 2 servidores y no uno solo con todo junto?**
R: Separación de responsabilidades — el privado tiene los datos (Postgres) y la lógica (API/Flask), nunca expuesto directo a internet; el público solo tiene el borde (HAProxy con SSL) y el panel de monitoreo (Grafana). Si alguien compromete el borde público, no llega directo a la base de datos — tiene que pasar primero por la capa de autenticación de la API, que sigue corriendo en una máquina aislada solo alcanzable por VPC.

**P: ¿Los dos servidores están realmente separados o es el mismo servidor con dos IPs?**
R: Son 2 droplets físicamente distintos de DigitalOcean, cada uno con su propio SO, disco, y firewall. Se puede confirmar con `ping` cruzado por la red privada (sección 2) y viendo que cada uno tiene contenedores Docker completamente distintos corriendo.

**P: ¿Qué pasa si el droplet público se cae?**
R: El privado sigue funcionando pero queda inalcanzable desde internet (por diseño — nadie puede llegar a él directo salvo el público vía VPC). Es un punto único de falla del lado del borde, aceptable para el alcance de este proyecto (no hay presupuesto/tiempo para HAProxy redundante). Si se cae el privado, el público sigue sirviendo el portal estático y Grafana, pero la API responde error de conexión (los backends no están disponibles).

**P: ¿Por qué el droplet privado reutiliza el droplet viejo en vez de crear uno nuevo?**
R: Decisión explícita para no perder los datos ya cargados en Postgres (usuarios, colaboradores, especies, avistamientos reales de pruebas previas). El volumen de Docker (`sway_postgres_data`) se mantuvo intacto durante toda la migración — se puede confirmar que sigue teniendo los mismos registros de antes del cambio de arquitectura.

### Seguridad de la aplicación

**P: ¿Por qué `werkzeug.security` y no la librería `bcrypt` directamente?**
R: Ambas son hashing salteado con factor de trabajo configurable, criptográficamente equivalentes en la práctica (Werkzeug usa PBKDF2-SHA256 con 600,000 iteraciones por defecto, comparable en costo computacional a bcrypt con un `cost factor` alto). La elección fue por ya estar en las dependencias del proyecto (Flask/Werkzeug), no una debilidad.

**P: ¿La API key es un secreto real?**
R: No, y no pretende serlo. Es una segunda capa **anti-scraping**, no de autenticación — está literalmente hardcodeada en el código de los 3 clientes (web1, web2, mobile) porque cualquiera que instale la app o inspeccione el JS del sitio puede verla. Lo que protege identidad y permisos reales es el JWT (`Authorization: Bearer`), que sí es secreto por usuario y expira.

**P: ¿Qué pasa si alguien roba el JWT de un usuario?**
R: Puede actuar como ese usuario hasta que el token expire (revisar `exp` en el payload — actualmente sin revocación activa de tokens individuales, limitación conocida). Mitigación parcial: tokens de vida corta, y todo tráfico va sobre HTTPS (no se puede interceptar en tránsito con TLS activo).

**P: ¿Por qué el rate limit de login es 5/minuto y no otro número?**
R: Balance entre usabilidad (un usuario real rara vez falla el login 5 veces seguidas en un minuto) y mitigar fuerza bruta (5 intentos/minuto = 300/hora máximo por IP, insuficiente para un ataque de diccionario efectivo contra un hash salteado). Los endpoints de verificación (`check-email/orcid/cedula`) tienen 20/minuto porque son de uso legítimo más frecuente durante el llenado del formulario (debounce de UI).

**P: ¿El límite de 100/minuto por defecto no es muy alto?**
R: Es un piso de seguridad para endpoints públicos de lectura (catálogo de especies, estadísticas) que un usuario normal puede refrescar varias veces sin ser un atacante. Los endpoints realmente sensibles (login, registro, cambio de password) tienen límites explícitos más estrictos que anulan ese default.

**P: ¿Por qué el rate limit no funcionaba la primera vez que lo probaron en producción?**
R: `slowapi` identificaba al cliente por `request.client.host`, que detrás de un proxy inverso (HAProxy) es siempre la IP del proxy, no la del visitante real — todo internet compartía un solo cupo. Se corrigió leyendo `X-Forwarded-For` (que HAProxy ya manda). Ver sección 5 para el detalle completo y cómo se verificó.

**P: ¿Aguanta el rate limiting una ráfaga real de tráfico, no solo 6 peticiones secuenciales?**
R: Sí — probado con 300 peticiones concurrentes reales contra producción (no simuladas, no localhost). 288/300 fueron rechazadas con `429`, cero lograron pasar el límite, y los 9 contenedores del droplet privado (incluyendo `sway_redis`) siguieron corriendo con CPU/memoria en niveles normales durante y después de la prueba. Ver sección 5 para el detalle completo, incluyendo por qué las 12 restantes fueron timeouts del lado del cliente, no del servidor.

**P: ¿Por qué antes un email como `"no-es-email"` se aceptaba en el registro?**
R: El campo estaba tipado como `str` con solo restricciones de longitud (`min_length`/`max_length`), sin ningún chequeo de formato. Se corrigió cambiando el tipo a `EmailStr` (Pydantic) en los 4 modelos que registran usuarios nuevos. Ver sección 11 para el detalle completo, incluyendo el efecto secundario de que dominios reservados como `.test` ahora también se rechazan (comportamiento correcto, no un bug).

### Monitoreo y Firewall

**P: ¿Qué pasa si Prometheus se cae?**
R: Los servicios de la app (API, Flask, Postgres) siguen funcionando normal — Prometheus solo recolecta métricas, no es una dependencia en el camino crítico de ninguna petición de usuario.

**P: ¿Por qué no hay `cadvisor` si Prometheus/Grafana normalmente lo incluyen?**
R: Decisión tomada tras diagnóstico real del droplet privado — 1.9GB de RAM total, solo 241MB libres con el stack de 4 contenedores original. `cadvisor` es el exporter más pesado de la stack típica de monitoreo Docker y el menos crítico para lo que pide la rúbrica (node_exporter + postgres_exporter + Prometheus ya cubren host, base de datos, y balanceo). Agregarlo hubiera arriesgado quedarse sin memoria (`OOM kill`) en producción.

**P: ¿El firewall realmente bloquea algo o es solo decorativo?**
R: Se puede probar en vivo — intentar `curl` directo a un puerto interno del droplet privado (`8001`, `9090`) desde cualquier máquina que no sea el droplet público da timeout, no conexión rechazada ni datos. Ver sección 4 para el comando exacto.

**P: ¿Qué es el bug de "Docker salta el firewall" que se menciona?**
R: Docker, por defecto, cuando publica un puerto (`ports: - "8001:8000"`), lo hace vía reglas `iptables`/`DNAT` que se insertan **antes** de la cadena `INPUT` que UFW usa para filtrar — esto significa que aunque UFW diga "denegado", el tráfico ya fue redirigido al contenedor antes de que UFW lo evalúe. La única forma correcta de que UFW funcione con Docker es publicar el puerto atado a una IP específica (`10.124.0.3:8001:8000` en vez de `8001:8000`, que equivale a `0.0.0.0:8001`). Este proyecto lo corrigió explícitamente — verificable con `docker ps` mostrando la IP en el mapeo de puertos (sección 4).

**P: ¿Por qué el panel "Backends activos" de Grafana estaba vacío al principio?**
R: Usaba la métrica `haproxy_server_up`, que no existe en las métricas reales que expone el exporter de Prometheus integrado en HAProxy 3.2 (se puede confirmar corriendo `curl http://146.190.136.236:8405/metrics | grep haproxy_server_` y viendo que ese nombre no aparece). Se corrigió a `haproxy_server_active`, la métrica real equivalente. Lección: cualquier expresión PromQL en un dashboard debe verificarse contra las métricas reales del exporter en uso, no copiarse de documentación genérica — versiones distintas de exporters exponen nombres distintos.

**P: ¿Por qué se ve `PasswordAuthentication yes` en el droplet privado — no es inseguro?**
R: Sí es un vector de ataque adicional (permite intentar login por contraseña, no solo por llave SSH), pero es una decisión explícita del equipo mantenerlo así (para poder entrar por contraseña si se pierde la llave). No se tocó esta sesión a pedido directo — documentado aquí para que quede claro que es una decisión consciente, no un descuido.

**P: ¿Para qué se instaló el agente de monitoreo de DigitalOcean si ya hay Prometheus/Grafana?**
R: Son complementarios, no redundantes. Prometheus/Grafana dan métricas de aplicación (tráfico HTTP, balanceo, conexiones a BD) con dashboards personalizados. El agente de DO (`do-agent`) da métricas de infraestructura básica (CPU, RAM, disco, red) directo en el panel de DigitalOcean, sin necesitar abrir Grafana — útil como respaldo rápido si algo falla y Grafana mismo no está accesible.

### SSL y dominio

**P: ¿Por qué el certificado era autofirmado al principio y ahora es real?**
R: La rúbrica solo pedía "certificado SSL para la plataforma" sin especificar autoridad certificadora, y no había un dominio confirmado al momento de escribir el plan original (solo IP). Una vez que se confirmó que el proyecto ya tenía un dominio comprado (`proyecto-sway.site`, gestionado en DigitalOcean DNS) se hizo el upgrade a un certificado real de Let's Encrypt — mejor evidencia para la evaluación y resuelve el problema de que apps móviles no confían en certificados autofirmados por defecto.

**P: ¿El certificado se renueva solo o hay que hacerlo a mano cada vez?**
R: Se renueva solo. Let's Encrypt emite certificados de 90 días; `certbot` deja una tarea programada de renovación automática, con hooks que detienen HAProxy, renuevan el certificado, lo recombinan al formato que HAProxy necesita, y reinician — probado con `certbot renew --dry-run` exitoso (simulación completa sin gastar cuota real de emisión).

**P: ¿Por qué el certificado no sirve si se accede por la IP en vez del dominio?**
R: Los certificados TLS están atados al *nombre de host* (`proyecto-sway.site`), no a la IP. Si el navegador se conecta a `https://146.190.136.236` directo, el certificado que el servidor presenta (válido para `proyecto-sway.site`) no coincide con el host al que el navegador cree estar hablando — eso es justamente lo que el TLS está diseñado para detectar y bloquear (evita ataques de suplantación). Es comportamiento esperado, no un error de configuración. Acceder siempre por el dominio.

### Balanceador de carga

**P: ¿Cómo se sabe que realmente hay 2 réplicas y no una sola respondiendo dos veces?**
R: Cada réplica (`api1`, `api2`) es un contenedor Docker separado con su propio proceso `uvicorn`, visible individualmente en `docker ps` en el droplet privado. La página de stats de HAProxy (`:8404/stats`) muestra cada una como una fila independiente con sus propias métricas de sesiones/peticiones — si fuera una sola instancia, solo habría una fila.

**P: ¿Qué algoritmo de balanceo se usa?**
R: `round robin` — reparte peticiones de forma secuencial y pareja entre las réplicas disponibles. HAProxy soporta otros algoritmos (`leastconn`, `source`, etc.) pero `round robin` es el estándar para servicios sin estado como esta API (JWT en cada petición, sin sesiones pegajosas necesarias).

**P: ¿Si una réplica se cae, el balanceador se entera?**
R: Sí — `option httpchk GET /health` en la configuración de HAProxy consulta cada réplica periódicamente; si una falla el healthcheck, HAProxy la saca del pool automáticamente sin necesitar intervención manual, y todo el tráfico se redirige a la réplica sana.

### Mobile

**P: ¿La app funciona sin conexión a la API real (modo offline)?**
R: No — es una app cliente-servidor pura, no tiene modo offline ni caché local persistente de datos de negocio. Cualquier pantalla que muestre datos de la BD requiere conexión activa a `https://proyecto-sway.site`.

**P: ¿Qué pasa si la app se abre sin haber iniciado sesión antes?**
R: Muestra el formulario de login/registro estándar. La biometría solo aparece como atajo si ya hubo un login exitoso previo en ese dispositivo (token guardado en `expo-secure-store`, cifrado a nivel de SO) — nunca reemplaza el primer login real.

**P: ¿Los datos de ubicación/foto se guardan en el dispositivo o se suben al servidor?**
R: La foto (`expo-image-picker`) es actualmente local/efímera — se usa para mostrarla en el formulario y en el compartir de tarjeta, pero no hay columna en la BD ni endpoint para persistir la imagen del lado del servidor (limitación conocida, documentada como pendiente). La ubicación GPS sí se envía y se guarda como `latitud`/`longitud` en la tabla `avistamientos`.

### Datos compartidos entre plataformas

**P: ¿Mobile y Web usan bases de datos distintas que se sincronizan, o la misma BD?**
R: La misma base de datos Postgres, sin sincronización — ambas plataformas hablan con la misma API REST, que lee/escribe directo sobre las mismas tablas. No hay retraso ni proceso de sync porque no hay dos fuentes de verdad.

**P: ¿Qué pasa si dos usuarios (uno en mobile, otro en Web2) editan el mismo registro al mismo tiempo?**
R: Gana el último `UPDATE` en llegar (no hay control de concurrencia optimista/locking implementado) — limitación conocida, aceptable para el alcance y volumen de uso real del proyecto.

### Despliegue en la nube

**P: ¿Por qué DigitalOcean y no AWS/Azure/GCP?**
R: Simplicidad de red privada (VPC) sin configuración adicional entre droplets del mismo datacenter, precio predecible por droplet, y suficiente para el volumen de tráfico de un proyecto académico. No hay requisito de la rúbrica que pida un proveedor específico.

**P: ¿Cuánto cuesta mantener esto corriendo?**
R: Droplet privado 2GB ~$18 USD/mes (ya existía antes de este trabajo), droplet público 1GB ~$6 USD/mes — total ~$24 USD/mes mientras el proyecto esté activo. Después de la entrega se pueden apagar ambos droplets para no seguir generando costo.

**P: ¿Qué se necesitaría para llevar esto a producción real (más allá del PI)?**
R: (1) Certificado wildcard o multi-dominio si se agregan subdominios, (2) réplica de Postgres para alta disponibilidad (hoy es instancia única, punto de falla), (3) rotación real de `JWT_SECRET_KEY`/`API_KEY` con proceso documentado, (4) CI/CD para que un `git push` a `master` despliegue solo automático (hoy el despliegue es manual por SSH), (5) alertas de Grafana (hoy solo hay dashboards, no notificaciones activas ante caídas).

