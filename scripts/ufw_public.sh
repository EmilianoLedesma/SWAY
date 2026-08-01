#!/bin/bash
# Firewall para el SERVIDOR PÚBLICO (10.10.10.1)
# Ejecutar como root: sudo bash scripts/ufw_public.sh

set -e

echo "Configurando UFW para servidor público..."

# Política base: bloquear todo lo que entra, permitir todo lo que sale
ufw default deny incoming
ufw default allow outgoing

# SSH — administración remota desde cualquier origen
ufw allow 22/tcp

# HTTP — Nginx lo redirige automáticamente a HTTPS (301)
ufw allow 80/tcp

# HTTPS — punto de entrada principal de la API con SSL
ufw allow 443/tcp

# Uptime Kuma — dashboard de monitoreo
ufw allow 3001/tcp

# Activar (responde "y" automáticamente)
ufw --force enable

echo ""
echo "=== Estado del firewall ==="
ufw status verbose
