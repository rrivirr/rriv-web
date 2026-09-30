import { UserManager, WebStorageStateStore } from "oidc-client-ts";
import { config } from "@/config";

/**
 * The single place OIDC is configured. Components never import
 * `oidc-client-ts` directly — they go through the auth context.
 *
 * `authority` is derived from the validated environment config:
 *   `${VITE_KEYCLOAK_URL}/realms/${VITE_KEYCLOAK_REALM}`
 */
export const userManager = new UserManager({
  authority: config.keycloak.authority,
  client_id: config.keycloak.clientId,
  redirect_uri: `${window.location.origin}/callback`,
  post_logout_redirect_uri: window.location.origin,
  // Required for automaticSilentRenew; served by the /silent-renew route.
  silent_redirect_uri: `${window.location.origin}/silent-renew`,
  response_type: "code",
  scope: "openid profile email",
  automaticSilentRenew: true,
  loadUserInfo: true,
  // Persist the session so a page reload does not force a new sign-in.
  userStore: new WebStorageStateStore({ store: window.localStorage }),
});
