#!/bin/sh
# nginx image entrypoint hook: write the runtime config from container env.
# Runs before nginx starts (files in /docker-entrypoint.d are executed in order).
set -eu

CONFIG_FILE=/usr/share/nginx/html/config.js

cat > "$CONFIG_FILE" <<EOF
window.__RRIV_CONFIG__ = {
  apiBaseUrl: "${RRIV_API_BASE_URL:-}",
  dataApiBaseUrl: "${RRIV_DATA_API_URL:-}",
  keycloakUrl: "${RRIV_KEYCLOAK_URL:-}",
  keycloakRealm: "${RRIV_KEYCLOAK_REALM:-}",
  keycloakClientId: "${RRIV_KEYCLOAK_CLIENT_ID:-}"
};
EOF

echo "rriv-web: wrote runtime config"
