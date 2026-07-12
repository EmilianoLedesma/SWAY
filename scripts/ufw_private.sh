#!/bin/bash
# Firewall para el SERVIDOR PRIVADO (10.10.10.2)
# Ejecutar como root: sudo bash scripts/ufw_private.sh
# IMPORTANTE: este servidor NO tiene adaptador puente — solo red interna 10.10.10.0/24

set -e

echo "Configurando UFW para servidor privado..."

# Política base: bloquear todo lo que entra, permitir todo lo que sale
ufw default deny incoming
ufw default allow outgoing

# SSH — solo desde la subred interna (administración desde el servidor público)
ufw allow from 10.10.10.0/24 to any port 22 proto tcp

# api_1 — solo el servidor público puede llamarla
ufw allow from 10.10.10.1 to any port 8001 proto tcp

# api_2 — solo el servidor público puede llamarla
ufw allow from 10.10.10.1 to any port 8002 proto tcp

# NADA más está abierto: postgres (5432) permanece inaccesible desde el host
# y desde la red interna; solo api_1 y api_2 le hablan por la red Docker interna.

ufw --force enable

echo ""
echo "=== Estado del firewall ==="
ufw status verbose
