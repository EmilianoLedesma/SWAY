#!/bin/bash
set -euo pipefail

ufw default deny incoming
ufw default allow outgoing

ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8404/tcp

# Metrics de HAProxy (:8405) — solo el Prometheus del droplet privado lo scrapea
ufw allow from 10.124.0.3 to any port 8405 proto tcp

ufw --force enable
ufw status verbose
