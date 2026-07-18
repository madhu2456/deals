#!/bin/bash
# Run as root on the server:
#   curl -fsSL https://raw.githubusercontent.com/madhu2456/deals/main/scripts/setup-nginx-deals.sh | bash
# or:
#   cd /opt/deals && sudo bash scripts/setup-nginx-deals.sh
#
# Proxies https://deals.madhudadi.in → http://127.0.0.1:3002
# (blog uses 3001, enroller uses 8000)

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

DOMAIN="${DOMAIN:-deals.madhudadi.in}"
APP_PORT="${APP_PORT:-3002}"
SITE="deals"

echo "=== Nginx setup for ${DOMAIN} → 127.0.0.1:${APP_PORT} ==="

# Inspect existing sites (for debugging multi-app servers)
echo "Existing sites-enabled:"
ls -la /etc/nginx/sites-enabled/ 2>/dev/null || true

# HTTP config first (works before certbot)
cat >"/etc/nginx/sites-available/${SITE}" <<EOF
# Deals app — managed by scripts/setup-nginx-deals.sh
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
EOF

ln -sfn "/etc/nginx/sites-available/${SITE}" "/etc/nginx/sites-enabled/${SITE}"

echo "Testing nginx..."
nginx -t
systemctl reload nginx
echo "HTTP config active."

# Optional TLS if certbot is installed and DNS points here
if command -v certbot >/dev/null 2>&1; then
  echo ""
  echo "Obtaining/renewing certificate for ${DOMAIN}..."
  certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect 2>/dev/null \
    || certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos \
      --register-unsafely-without-email --redirect 2>/dev/null \
    || echo "Certbot skipped (DNS not ready or cert already managed). HTTP still works."
  nginx -t && systemctl reload nginx
else
  echo ""
  echo "Certbot not installed. After DNS is set, run:"
  echo "  apt-get install -y certbot python3-certbot-nginx"
  echo "  certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
fi

echo ""
echo "=== Done ==="
echo "  Upstream: http://127.0.0.1:${APP_PORT}"
echo "  Site file: /etc/nginx/sites-available/${SITE}"
echo "  Test: curl -I http://127.0.0.1:${APP_PORT}/   (deals container must be up)"
echo "        curl -I http://${DOMAIN}/"
