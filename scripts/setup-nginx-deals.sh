#!/bin/bash
# Install repo-managed Nginx config (as root).
#   sudo bash /opt/deals/scripts/setup-nginx-deals.sh
#
# For ongoing deploys, deploy.sh --update copies nginx/deals*.conf automatically
# if madhu has passwordless sudo for nginx reload (or runs install as root).

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

APP_DIR="${APP_DIR:-/opt/deals}"
export DOMAIN="${DOMAIN:-deals.madhudadi.in}"
export APP_PORT="${APP_PORT:-3002}"
export APP_NAME=deals
export DEPLOY_USER="${DEPLOY_USER:-madhu}"

if [ ! -f "${APP_DIR}/deploy.sh" ]; then
  echo "Missing ${APP_DIR}/deploy.sh — pull the deals repo first."
  exit 1
fi

# shellcheck disable=SC1091
# Re-use the same installer as deploy.sh by running only that function path:
cd "${APP_DIR}"
git pull origin main 2>/dev/null || true

# Inline install (same logic as deploy.sh install_nginx_from_repo)
http_src="${APP_DIR}/nginx/deals.conf"
ssl_src="${APP_DIR}/nginx/deals.ssl.conf"
dest="/etc/nginx/sites-available/deals"
enabled="/etc/nginx/sites-enabled/deals"
tmp="$(mktemp)"

if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ] && [ -f "${ssl_src}" ]; then
  echo "Installing SSL config from repo..."
  sed -e "s/__DOMAIN__/${DOMAIN}/g" -e "s/__APP_PORT__/${APP_PORT}/g" "${ssl_src}" >"${tmp}"
  [ -f /etc/letsencrypt/ssl-dhparams.pem ] || sed -i '/ssl_dhparam/d' "${tmp}"
  [ -f /etc/letsencrypt/options-ssl-nginx.conf ] || sed -i '/options-ssl-nginx.conf/d' "${tmp}"
else
  echo "Installing HTTP config from repo..."
  sed -e "s/__DOMAIN__/${DOMAIN}/g" -e "s/__APP_PORT__/${APP_PORT}/g" "${http_src}" >"${tmp}"
fi

cp "${tmp}" "${dest}"
rm -f "${tmp}"
ln -sfn "${dest}" "${enabled}"
mkdir -p /var/www/html

nginx -t
systemctl reload nginx
echo "Done: ${dest} → 127.0.0.1:${APP_PORT} for ${DOMAIN}"
