import { useMemo } from "react";
import { config } from "@/config";
import { useAuth } from "@/auth/useAuth";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Resolves the token to use for a single request. */
export type TokenProvider = () => Promise<string | null>;

function resolveUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${config.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => null);
}

function extractMessage(payload: unknown, status: number): string {
  if (
    payload !== null &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof (payload as { message: unknown }).message === "string"
  ) {
    return (payload as { message: string }).message;
  }
  return `Request failed with status ${status}`;
}

/**
 * Thin `fetch` wrapper around the existing RRIV REST API.
 *
 * The token is requested through `getToken` on EVERY call and is never held at
 * module scope, so a silent refresh can never leave a stale token behind.
 */
export async function apiFetch<T>(
  getToken: TokenProvider,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken();

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  const method = (init.method ?? "GET").toUpperCase();
  const sendsBody = method === "POST" || method === "PATCH" || method === "PUT";
  if ((init.body !== undefined || sendsBody) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(resolveUrl(path), { ...init, headers });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await readBody(response);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractMessage(payload, response.status),
      payload,
    );
  }

  return payload as T;
}

/**
 * Auth-aware API client. Reads the current token from the auth context at call
 * time — the idiomatic way for components and TanStack Query functions to talk
 * to the API.
 *
 * ⚠️ The RRIV API additionally requires a local `account` row whose id matches
 * the token's `sub` claim; a fresh Keycloak user will get 401 until onboarded
 * via POST /account.
 */
export function useApiClient() {
  const { getAccessToken } = useAuth();

  return useMemo(
    () => ({
      get: <T>(path: string, init?: RequestInit) =>
        apiFetch<T>(getAccessToken, path, init),
      post: <T>(path: string, body?: unknown, init?: RequestInit) =>
        apiFetch<T>(getAccessToken, path, {
          method: "POST",
          body: body === undefined ? undefined : JSON.stringify(body),
          ...init,
        }),
      patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
        apiFetch<T>(getAccessToken, path, {
          method: "PATCH",
          body: body === undefined ? undefined : JSON.stringify(body),
          ...init,
        }),
      put: <T>(path: string, body?: unknown, init?: RequestInit) =>
        apiFetch<T>(getAccessToken, path, {
          method: "PUT",
          body: body === undefined ? undefined : JSON.stringify(body),
          ...init,
        }),
      delete: <T>(path: string, init?: RequestInit) =>
        apiFetch<T>(getAccessToken, path, { method: "DELETE", ...init }),
    }),
    [getAccessToken],
  );
}
