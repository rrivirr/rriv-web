/// <reference types="vite/client" />

/**
 * Compile-time contract for the environment variables this app consumes.
 * Keep in sync with `.env.example`.
 */
interface ImportMetaEnv {
  readonly VITE_RRIV_API_BASE_URL: string;
  readonly VITE_KEYCLOAK_URL: string;
  readonly VITE_KEYCLOAK_REALM: string;
  readonly VITE_KEYCLOAK_CLIENT_ID: string;
  /** Telemetry API (data-api). Defaults to http://localhost:3010. */
  readonly VITE_DATA_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Runtime configuration injected by the container as `/config.js`. Takes
 * precedence over build-time Vite env so a single image can serve every
 * environment.
 */
interface Window {
  __RRIV_CONFIG__?: {
    apiBaseUrl?: string;
    dataApiBaseUrl?: string;
    keycloakUrl?: string;
    keycloakRealm?: string;
    keycloakClientId?: string;
  };
}
