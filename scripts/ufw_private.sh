#!/bin/bash
set -euo pipefail

# Limpiar reglas del despliegue de un solo droplet — ya no aplica, este droplet
# deja de exponer 80/443 directo (eso ahora vive en el droplet público).
ufw delete allow 80/tcp || true
ufw delete allow 443/tcp || true
ufw delete allow "80/tcp (v6)" || true
ufw delete allow "443/tcp (v6)" || true

ufw default deny incoming
ufw default allow outgoing

ufw allow 22/tcp

# API y Flask balanceados — solo alcanzables desde el droplet público (VPC)
ufw allow from 10.124.0.2 to any port 8001 proto tcp
ufw allow from 10.124.0.2 to any port 8002 proto tcp
ufw allow from 10.124.0.2 to any port 5001 proto tcp
ufw allow from 10.124.0.2 to any port 5002 proto tcp

# Prometheus (:9090) accesible solo desde el droplet público, para que Grafana
# lo consulte directo por la VPC — no expuesto a internet.
ufw allow from 10.124.0.2 to any port 9090 proto tcp

# postgres (5432) NO se abre — solo la red Docker interna lo alcanza

ufw --force enable
ufw status verbose
