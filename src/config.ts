/**
 * Single source of truth for environment-specific values.
 *
 * Values come from, in order of precedence:
 *   1. `window.__RRIV_CONFIG__` (runtime, injected by the container as
 *      `/config.js`) — lets one image serve every environment.
 *   2. Vite's build-time `import.meta.env` (local dev and the test stack).
 *
 * This module validates configuration the moment it is imported, so a
 * misconfigured environment fails fast with an actionable message.
 *
 * Components must never read `import.meta.env` or hardcode URLs, realms or
 * client IDs — they import `config` from here instead.
 */

const REQUIRED_VARS = [
  "VITE_RRIV_API_BASE_URL",
  "VITE_KEYCLOAK_URL",
  "VITE_KEYCLOAK_REALM",
  "VITE_KEYCLOAK_CLIENT_ID",
] as const;

/** Injected at runtime via `/config.js` (see deployment/nginx). */
const runtime = window.__RRIV_CONFIG__ ?? {};

const env = {
  VITE_RRIV_API_BASE_URL:
    runtime.apiBaseUrl?.trim() || import.meta.env.VITE_RRIV_API_BASE_URL,
  VITE_DATA_API_URL:
    runtime.dataApiBaseUrl?.trim() || import.meta.env.VITE_DATA_API_URL,
  VITE_KEYCLOAK_URL:
    runtime.keycloakUrl?.trim() || import.meta.env.VITE_KEYCLOAK_URL,
  VITE_KEYCLOAK_REALM:
    runtime.keycloakRealm?.trim() || import.meta.env.VITE_KEYCLOAK_REALM,
  VITE_KEYCLOAK_CLIENT_ID:
    runtime.keycloakClientId?.trim() || import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
} as Record<string, string | undefined>;

const missing = REQUIRED_VARS.filter((key) => !env[key]?.trim());

if (missing.length > 0) {
  throw new Error(
    [
      "Missing required environment variable(s):",
      ...missing.map((key) => `  - ${key}`),
      "",
      "Provide them via /config.js (runtime) or .env (build time).",
    ].join("\n"),
  );
}

/** Trims, strips trailing slashes, and asserts an absolute URL. */
function asUrl(value: string, key: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  try {
    new URL(trimmed);
  } catch {
    throw new Error(
      `Environment variable ${key} must be a valid absolute URL, received "${value}".`,
    );
  }
  return trimmed;
}

const keycloakUrl = asUrl(env.VITE_KEYCLOAK_URL!, "VITE_KEYCLOAK_URL");
const keycloakRealm = env.VITE_KEYCLOAK_REALM!.trim();

/** Telemetry API (data-api); optional with a local default. */
const dataApiUrl = asUrl(
  env.VITE_DATA_API_URL?.trim() || "http://localhost:3010",
  "VITE_DATA_API_URL",
);

export const config = {
  apiBaseUrl: asUrl(env.VITE_RRIV_API_BASE_URL!, "VITE_RRIV_API_BASE_URL"),
  dataApiBaseUrl: dataApiUrl,
  keycloak: {
    url: keycloakUrl,
    realm: keycloakRealm,
    clientId: env.VITE_KEYCLOAK_CLIENT_ID!.trim(),
    /** Derived, never hardcoded: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}` */
    authority: `${keycloakUrl}/realms/${keycloakRealm}`,
  },
} as const;

export type AppConfig = typeof config;
