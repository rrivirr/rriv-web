import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { User } from "oidc-client-ts";
import { userManager } from "./userManager";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  /** The current OIDC user (includes the access token), or null. */
  user: User | null;
  status: AuthStatus;
  /** Last sign-in / session error, if any. */
  error: string | null;
  signin: () => Promise<void>;
  signout: () => Promise<void>;
  /**
   * Resolves the freshest access token on demand. Callers (notably the API
   * client) must invoke this per request instead of caching the result.
   */
  getAccessToken: () => Promise<string | null>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function describe(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void userManager
      .getUser()
      .then((current) => {
        if (!active) return;
        setUser(current);
        setStatus(current && !current.expired ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (active) setStatus("unauthenticated");
      });

    const onUserLoaded = (loaded: User) => {
      setUser(loaded);
      setStatus("authenticated");
    };
    const onUserUnloaded = () => {
      setUser(null);
      setStatus("unauthenticated");
    };
    const onAccessTokenExpired = () => setStatus("unauthenticated");
    const onSilentRenewError = (cause: Error) =>
      setError(`Session renewal failed: ${cause.message}`);

    userManager.events.addUserLoaded(onUserLoaded);
    userManager.events.addUserUnloaded(onUserUnloaded);
    userManager.events.addAccessTokenExpired(onAccessTokenExpired);
    userManager.events.addSilentRenewError(onSilentRenewError);

    return () => {
      active = false;
      userManager.events.removeUserLoaded(onUserLoaded);
      userManager.events.removeUserUnloaded(onUserUnloaded);
      userManager.events.removeAccessTokenExpired(onAccessTokenExpired);
      userManager.events.removeSilentRenewError(onSilentRenewError);
    };
  }, []);

  const signin = useCallback(async () => {
    setError(null);
    try {
      await userManager.signinRedirect();
    } catch (cause) {
      setError(describe(cause, "Unable to start sign-in."));
    }
  }, []);

  const signout = useCallback(async () => {
    setError(null);
    try {
      await userManager.signoutRedirect();
    } catch (cause) {
      setError(describe(cause, "Unable to sign out."));
    }
  }, []);

  const getAccessToken = useCallback(async () => {
    const current = await userManager.getUser();
    if (!current) return null;
    if (!current.expired) return current.access_token;

    const renewed = await userManager.signinSilent().catch(() => null);
    return renewed?.access_token ?? null;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, error, signin, signout, getAccessToken }),
    [user, status, error, signin, signout, getAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
