#!/bin/sh
# nginx image entrypoint hook: write the runtime config and security headers
# from container env. Runs before nginx starts (files in /docker-entrypoint.d
# are executed in order), so the files exist by the time nginx reads its config.
set -eu

CONFIG_FILE=/usr/share/nginx/html/config.js
HEADERS_FILE=/etc/nginx/rriv/security-headers.conf

cat > "$CONFIG_FILE" <<EOF
window.__RRIV_CONFIG__ = {
  apiBaseUrl: "${RRIV_API_BASE_URL:-}",
  dataApiBaseUrl: "${RRIV_DATA_API_URL:-}",
  keycloakUrl: "${RRIV_KEYCLOAK_URL:-}",
  keycloakRealm: "${RRIV_KEYCLOAK_REALM:-}",
  keycloakClientId: "${RRIV_KEYCLOAK_CLIENT_ID:-}"
};
EOF

# Content-Security-Policy. `script-src 'self'` is strict: the app has no inline
# scripts (the theme bootstrap is /theme-init.js). Style needs 'unsafe-inline'
# for React/Recharts inline style attributes. `connect-src`/`frame-src` include
# the per-environment Keycloak origin (silent-renew iframe + token/discovery)
# and the API origins, which are only known at runtime.
CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ${RRIV_API_BASE_URL:-} ${RRIV_DATA_API_URL:-} ${RRIV_KEYCLOAK_URL:-}; frame-src 'self' ${RRIV_KEYCLOAK_URL:-}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"

mkdir -p /etc/nginx/rriv
cat > "$HEADERS_FILE" <<EOF
add_header Content-Security-Policy "$CSP" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-Frame-Options "DENY" always;
add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
EOF

echo "rriv-web: wrote runtime config and security headers"
