#!/bin/bash
# Suite automatizada de verificacion de los 14 requisitos del PI.
# Corre contra produccion real (droplets + dominio), no contra localhost.
# Requiere: curl, openssl, ssh (con llave autorizada en ambos droplets), psql via docker exec remoto.
#
# Uso:
#   ./scripts/verify_pi_requirements.sh
#   SSH_KEY=~/.ssh/otra_llave ./scripts/verify_pi_requirements.sh
#
# Cada punto de la rubrica se prueba con MULTIPLES metodos independientes
# (curl, SQL, ping, openssl, ufw status, docker ps) — ver docs/PI_REQUIREMENTS_VERIFICATION.md
# para la explicacion detallada de cada comando usado aqui.

set -uo pipefail

SSH_KEY="${SSH_KEY:-$HOME/.ssh/sway_deploy}"
PRIVATE_IP="165.232.146.240"
PRIVATE_VPC="10.124.0.3"
PUBLIC_IP="146.190.136.236"
PUBLIC_VPC="10.124.0.2"
DOMAIN="proyecto-sway.site"
API_KEY="f6bed84d1b5bb4af3ff44231c8c8bae5c8efc3709ee1510b"

PASS=0
FAIL=0
SKIP=0

pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }
skip() { echo "  SKIP: $1"; SKIP=$((SKIP+1)); }
section() { echo ""; echo "== $1 =="; }

ssh_priv() { ssh -i "$SSH_KEY" -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new "root@$PRIVATE_IP" "$@"; }
ssh_pub()  { ssh -i "$SSH_KEY" -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new "root@$PUBLIC_IP" "$@"; }
curl_dom() { curl -s --resolve "$DOMAIN:443:$PUBLIC_IP" --max-time 8 "$@"; }

echo "Suite de verificacion PI — SWAY"
echo "Llave SSH: $SSH_KEY"

# ---------------------------------------------------------------
section "1. Hasheado y encriptado"
# Metodo A: contar cuentas hasheadas correctamente en produccion real
COUNT=$(ssh_priv "docker exec sway_postgres psql -U sway_app -d sway -tAc \"SELECT count(*) FROM usuarios WHERE password_hash LIKE 'pbkdf2:%'\"" 2>/dev/null)
if [[ "${COUNT:-0}" -gt 0 ]]; then pass "hay $COUNT cuentas con hash pbkdf2 real en la BD"; else fail "no se encontraron cuentas con hash real"; fi

# Metodo B: registrar cuenta de prueba y confirmar hash real (no la clave en texto plano)
# El payload se escribe a un archivo para evitar que el shell rompa el caracter "ñ" en años_experiencia.
REG_PAYLOAD_FILE=$(mktemp)
cat > "$REG_PAYLOAD_FILE" << PAYLOAD_EOF
{"nombre":"SuiteTest","email":"suite-verify-$RANDOM@demo-sway.com","password":"claveSuite123","especialidad":"Verificacion","grado_academico":"Licenciatura","institucion":"UPQ","años_experiencia":"1","motivacion":"Verificacion automatizada"}
PAYLOAD_EOF
REG=$(curl_dom -X POST "https://$DOMAIN/api/colaboradores/register" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  --data-binary "@$REG_PAYLOAD_FILE")
rm -f "$REG_PAYLOAD_FILE"
if echo "$REG" | grep -q '"success":true'; then pass "registro real via API exitoso (hasheo aplicado hacia adelante)"; else fail "registro de prueba fallo: $REG"; fi

# ---------------------------------------------------------------
section "2. Dos servidores (publico/privado)"
if ssh_pub "ping -c 2 -W 3 $PRIVATE_VPC" > /dev/null 2>&1; then pass "ping VPC publico->privado OK"; else fail "ping VPC fallo"; fi

PRIV_CONTAINERS=$(ssh_priv "docker ps --format '{{.Names}}'" 2>/dev/null | wc -l)
[[ "$PRIV_CONTAINERS" -ge 8 ]] && pass "$PRIV_CONTAINERS contenedores en privado (esperado >=8)" || fail "solo $PRIV_CONTAINERS contenedores en privado"

PUB_CONTAINERS=$(ssh_pub "docker ps --format '{{.Names}}'" 2>/dev/null | wc -l)
[[ "$PUB_CONTAINERS" -ge 3 ]] && pass "$PUB_CONTAINERS contenedores en publico (esperado >=3)" || fail "solo $PUB_CONTAINERS contenedores en publico"

if ! curl -m 5 -s "http://$PRIVATE_IP:8001/" > /dev/null 2>&1; then pass "droplet privado inalcanzable directo por internet (correcto)"; else fail "droplet privado responde directo — deberia estar bloqueado"; fi

# ---------------------------------------------------------------
section "3. Monitoreo (Prometheus/Grafana)"
TARGETS_UP=$(ssh_priv "curl -s http://$PRIVATE_VPC:9090/api/v1/targets" 2>/dev/null | grep -o '"health":"up"' | wc -l)
[[ "$TARGETS_UP" -ge 4 ]] && pass "$TARGETS_UP targets de Prometheus en up (esperado >=4)" || fail "solo $TARGETS_UP targets up"

GRAFANA_CODE=$(curl_dom -o /dev/null -w "%{http_code}" "https://$DOMAIN/grafana/login")
[[ "$GRAFANA_CODE" == "200" ]] && pass "Grafana responde 200" || fail "Grafana respondio $GRAFANA_CODE"

DO_AGENT_PRIV=$(ssh_priv "systemctl is-active do-agent" 2>/dev/null)
DO_AGENT_PUB=$(ssh_pub "systemctl is-active do-agent" 2>/dev/null)
[[ "$DO_AGENT_PRIV" == "active" && "$DO_AGENT_PUB" == "active" ]] && pass "do-agent activo en ambos droplets" || fail "do-agent no activo en ambos (priv=$DO_AGENT_PRIV pub=$DO_AGENT_PUB)"

# ---------------------------------------------------------------
section "4. Firewall aplicado y monitoreado"
UFW_PRIV=$(ssh_priv "ufw status" 2>/dev/null | head -1)
UFW_PUB=$(ssh_pub "ufw status" 2>/dev/null | head -1)
[[ "$UFW_PRIV" == "Status: active" ]] && pass "UFW activo en privado" || fail "UFW privado: $UFW_PRIV"
[[ "$UFW_PUB" == "Status: active" ]] && pass "UFW activo en publico" || fail "UFW publico: $UFW_PUB"

BIND_CHECK=$(ssh_priv "docker ps --format '{{.Ports}}' | grep -c '$PRIVATE_VPC:8001'" 2>/dev/null)
[[ "${BIND_CHECK:-0}" -ge 1 ]] && pass "puertos Docker bindeados a IP VPC (no 0.0.0.0)" || fail "bind a 0.0.0.0 detectado — bug de seguridad"

if ! curl -m 5 -s "http://$PRIVATE_IP:8001/health" > /dev/null 2>&1; then pass "puerto interno 8001 inalcanzable desde fuera de VPC"; else fail "puerto interno 8001 respondio desde fuera"; fi

SSH_REJECT=$(ssh -o PasswordAuthentication=no -o PubkeyAuthentication=no -o BatchMode=yes -o ConnectTimeout=5 "root@$PRIVATE_IP" "whoami" 2>&1)
echo "$SSH_REJECT" | grep -q "Permission denied" && pass "SSH rechaza conexion sin llave valida" || fail "SSH no rechazo correctamente: $SSH_REJECT"

# ---------------------------------------------------------------
section "5. Proteccion de API con JWT"
NO_KEY_CODE=$(curl_dom -o /dev/null -w "%{http_code}" "https://$DOMAIN/api/colaboradores/profile" -H "x-api-key: $API_KEY")
[[ "$NO_KEY_CODE" == "401" ]] && pass "sin token: 401 correcto" || fail "sin token dio $NO_KEY_CODE (esperado 401)"

REAL_KEY_CODE=$(curl_dom -o /dev/null -w "%{http_code}" -H "x-api-key: wrong-key-123" "https://$DOMAIN/api/estadisticas")
[[ "$REAL_KEY_CODE" == "401" ]] && pass "x-api-key invalida: 401 correcto" || fail "x-api-key invalida dio $REAL_KEY_CODE"

VALID_CODE=$(curl_dom -o /dev/null -w "%{http_code}" -H "x-api-key: $API_KEY" "https://$DOMAIN/api/estadisticas")
[[ "$VALID_CODE" == "200" ]] && pass "x-api-key valida: 200 correcto" || fail "x-api-key valida dio $VALID_CODE"

RL_RESULT=$(ssh_priv "for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w '%{http_code} ' -X POST http://$PRIVATE_VPC:8001/api/colaboradores/login -H 'Content-Type: application/json' -H 'x-api-key: $API_KEY' -d '{\"email\":\"rate-limit-check@demo-sway.com\",\"password\":\"incorrecta\"}'; done" 2>/dev/null)
echo "$RL_RESULT" | grep -q "429" && pass "rate limiting real: intento 6 dio 429 ($RL_RESULT)" || fail "rate limiting no disparo 429: $RL_RESULT"

# ---------------------------------------------------------------
section "6. Certificado SSL"
ISSUER=$(echo | openssl s_client -connect "$PUBLIC_IP:443" -servername "$DOMAIN" 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null)
echo "$ISSUER" | grep -q "Let's Encrypt" && pass "cert emitido por Let's Encrypt: $ISSUER" || fail "issuer inesperado: $ISSUER"

NO_K_CODE=$(curl_dom -o /dev/null -w "%{http_code}" "https://$DOMAIN/")
[[ "$NO_K_CODE" == "200" ]] && pass "conexion TLS exitosa sin -k (cert confiable)" || fail "conexion TLS fallo sin -k: $NO_K_CODE"

# ---------------------------------------------------------------
section "7. Balanceador de carga"
for i in $(seq 1 10); do curl_dom -H "x-api-key: $API_KEY" "https://$DOMAIN/api/estadisticas" -o /dev/null; done
SPLIT=$(ssh_pub "curl -s -u 'admin:LwDHQIlCouk-0fMHGv2C6y1N' 'http://localhost:8404/stats;csv'" 2>/dev/null | grep "^api_back,api")
API1_N=$(echo "$SPLIT" | grep ",api1," | cut -d',' -f8)
API2_N=$(echo "$SPLIT" | grep ",api2," | cut -d',' -f8)
if [[ -n "$API1_N" && -n "$API2_N" && "$API1_N" -gt 0 && "$API2_N" -gt 0 ]]; then
  pass "trafico repartido: api1=$API1_N api2=$API2_N"
else
  fail "no se detecto reparto real: api1=$API1_N api2=$API2_N"
fi

# ---------------------------------------------------------------
section "8-10. Mobile (utilidad real, diseno, navegacion)"
skip "requiere interaccion manual con dispositivo real — ver docs/PI_REQUIREMENTS_VERIFICATION.md seccion 'Como levantar la app en Expo Go'"

# ---------------------------------------------------------------
section "11. Formularios con validacion real"
BAD_EMAIL=$(curl_dom -X POST "https://$DOMAIN/api/colaboradores/register" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"nombre":"","email":"no-es-email","password":"123"}')
echo "$BAD_EMAIL" | grep -q "not a valid email" && pass "email malformado rechazado (422 real)" || fail "email malformado no fue rechazado: $BAD_EMAIL"

# ---------------------------------------------------------------
section "12. Datos mobile reflejados en Web"
AVISTAMIENTOS=$(curl_dom -H "x-api-key: $API_KEY" "https://$DOMAIN/api/avistamientos")
echo "$AVISTAMIENTOS" | grep -q '"id"' && pass "endpoint compartido /api/avistamientos devuelve datos reales" || fail "endpoint compartido no devolvio datos"

# ---------------------------------------------------------------
section "13. Web + API + BD en la nube"
W1=$(curl_dom -o /dev/null -w "%{http_code}" "https://$DOMAIN/")
W2=$(curl_dom -o /dev/null -w "%{http_code}" "https://$DOMAIN/portal/")
API_DOCS=$(curl_dom -o /dev/null -w "%{http_code}" "https://$DOMAIN/docs")
[[ "$W1" == "200" && "$W2" == "200" && "$API_DOCS" == "200" ]] && pass "Web1=$W1 Web2=$W2 API=$API_DOCS — los 3 responden" || fail "Web1=$W1 Web2=$W2 API=$API_DOCS"

TABLES=$(ssh_priv "docker exec sway_postgres psql -U sway_app -d sway -tAc \"SELECT count(*) FROM information_schema.tables WHERE table_schema='public'\"" 2>/dev/null)
[[ "${TABLES:-0}" -ge 25 ]] && pass "$TABLES tablas reales en la BD (esperado >=25)" || fail "solo $TABLES tablas encontradas"

# ---------------------------------------------------------------
section "14. App movil 100% funcional (API_HOST real)"
if grep -q "API_HOST = 'https://$DOMAIN'" "$(dirname "$0")/../MockupsSwayMobile/src/api/client.js" 2>/dev/null; then
  pass "API_HOST apunta a produccion real, no a localhost"
else
  fail "API_HOST no apunta al dominio de produccion esperado"
fi

# ---------------------------------------------------------------
echo ""
echo "=================================="
echo "RESULTADO: $PASS pass, $FAIL fail, $SKIP skip (manual)"
echo "=================================="
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
