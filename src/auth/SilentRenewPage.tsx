import { useEffect, useRef } from "react";
import { userManager } from "./userManager";

/**
 * Rendered inside the hidden iframe used by `automaticSilentRenew`.
 * It only hands the token response back to the parent window.
 */
export function SilentRenewPage() {
  // StrictMode runs effects twice in development; the response can only be
  // consumed once (same guard as CallbackPage).
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    void userManager.signinSilentCallback().catch((cause: unknown) => {
      console.error("Silent renew failed", cause);
    });
  }, []);

  return null;
}
