#!/usr/bin/env bash
#
# verify-cf-cidrs.sh — Cloudflare CIDR drift guard
#
# Usage: ./scripts/verify-cf-cidrs.sh
#
# Fetches the currently published Cloudflare ranges (ips-v4 + ips-v6) and diffs
# them against the `set_real_ip_from` CIDRs in
# nginx/conf.d/00-cloudflare-real-ip.conf. Exits non-zero when Cloudflare has
# published new ranges so the conf file gets updated.
#
# Offline behaviour: if cloudflare.com cannot be reached, prints a warning and
# exits 0 — CI must not fail when there is no network.
#
# NOTE: When Cloudflare announces new ranges, mirror the update to the
# blog_platform repo (nginx/conf.d/00-cloudflare-real-ip.conf) and the Udemy
# Enroller repo (scripts/deploy.sh heredoc) — they keep the same
# set_real_ip_from list.
#
set -euo pipefail

CF_V4_URL="https://www.cloudflare.com/ips-v4"
CF_V6_URL="https://www.cloudflare.com/ips-v6"
CONF_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/nginx/conf.d/00-cloudflare-real-ip.conf"

if ! command -v curl >/dev/null 2>&1; then
    echo "WARNING: curl not available — skipping Cloudflare CIDR drift check" >&2
    exit 0
fi

cf_v4="$(curl -fsSL --max-time 15 "$CF_V4_URL" 2>/dev/null || true)"
cf_v6="$(curl -fsSL --max-time 15 "$CF_V6_URL" 2>/dev/null || true)"

if [ -z "$cf_v4" ] && [ -z "$cf_v6" ]; then
    echo "WARNING: could not fetch Cloudflare IP ranges (offline?) — skipping drift check" >&2
    exit 0
fi
if [ -z "$cf_v4" ] || [ -z "$cf_v6" ]; then
    echo "WARNING: partial fetch of Cloudflare IP ranges (v4=${cf_v4:+ok}, v6=${cf_v6:+ok}) — skipping drift check" >&2
    exit 0
fi

published="$(printf '%s\n%s\n' "$cf_v4" "$cf_v6" | sed '/^[[:space:]]*$/d' | sort -u)"
deployed="$(grep -E '^[[:space:]]*set_real_ip_from ' "$CONF_FILE" | awk '{print $2}' | tr -d ';' | sort -u)"

added="$(comm -23 <(printf '%s\n' "$published") <(printf '%s\n' "$deployed"))"
removed="$(comm -13 <(printf '%s\n' "$published") <(printf '%s\n' "$deployed"))"

if [ -n "$added" ] || [ -n "$removed" ]; then
    echo "DRIFT: Cloudflare published ranges differ from nginx/conf.d/00-cloudflare-real-ip.conf" >&2
    if [ -n "$added" ]; then
        echo "New Cloudflare ranges NOT in nginx/conf.d/00-cloudflare-real-ip.conf:" >&2
        printf '%s\n' "$added" | sed 's/^/  /' >&2
    fi
    if [ -n "$removed" ]; then
        echo "Ranges in nginx/conf.d/00-cloudflare-real-ip.conf no longer published by Cloudflare:" >&2
        printf '%s\n' "$removed" | sed 's/^/  /' >&2
    fi
    echo "Update nginx/conf.d/00-cloudflare-real-ip.conf + mirror copies (blog conf.d, Udemy deploy.sh heredoc)." >&2
    exit 1
fi

echo "OK: nginx/conf.d/00-cloudflare-real-ip.conf set_real_ip_from ranges match Cloudflare published ranges ($(printf '%s\n' "$published" | wc -l | tr -d ' ') CIDRs)"
