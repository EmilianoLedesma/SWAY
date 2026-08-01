#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/certs"

MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 \
  -keyout server.key \
  -out server.crt \
  -days 365 -nodes \
  -subj "/CN=sway.local/O=SWAY Conservacion Marina/C=MX"

cat server.crt server.key > server.pem
chmod 600 server.key server.pem

echo "Certificado generado en haproxy/certs/server.pem"
