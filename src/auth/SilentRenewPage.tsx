import { useEffect } from "react";
import { userManager } from "./userManager";

/**
 * Rendered inside the hidden iframe used by `automaticSilentRenew`.
 * It only hands the token response back to the parent window.
 */
export function SilentRenewPage() {
  useEffect(() => {
    void userManager.signinSilentCallback().catch((cause: unknown) => {
      console.error("Silent renew failed", cause);
    });
  }, []);

  return null;
}
