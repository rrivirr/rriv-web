import { ApiError } from "@/api/client";

/**
 * Renders a readable error for a failed API query. A 401 means the signed-in
 * Keycloak user has no local `account` row yet (onboard via `POST /account`).
 */
export function QueryError({
  error,
  label = "data",
}: {
  error: unknown;
  label?: string;
}) {
  if (!error) return null;

  if (error instanceof ApiError && error.status === 401) {
    return (
      <div className="surface border-amber-500/30 p-4 text-sm text-amber-600 dark:text-amber-200">
        Your account is not linked to the RRIV API yet, so {label} cannot be
        loaded. Finish onboarding via the sign-up flow.
      </div>
    );
  }

  const message =
    error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="surface border-red-500/30 p-4 text-sm text-red-600 dark:text-red-300">
      Could not load {label}: {message}
    </div>
  );
}
