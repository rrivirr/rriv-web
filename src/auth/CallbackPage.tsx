import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Card } from "@/components/Card";
import { Spinner } from "@/components/Spinner";
import { userManager } from "./userManager";

/**
 * Completes the Authorization Code + PKCE redirect.
 *
 * The ref guard makes this resilient to React StrictMode's double-invoked
 * effects in development (the second pass is a no-op instead of a failed
 * second exchange).
 */
export function CallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    void userManager
      .signinRedirectCallback()
      .then(() => navigate("/contexts", { replace: true }))
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : "Sign-in could not be completed.",
        ),
      );
  }, [navigate]);

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center px-4">
        <Card className="text-center">
          <h1 className="text-lg font-semibold text-fg">Sign-in failed</h1>
          <p
            role="alert"
            className="mt-3 text-sm text-red-600 dark:text-red-300"
          >
            {error}
          </p>
          <Link to="/login" className="btn btn-primary mt-6">
            Back to sign in
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner label="Completing sign-in…" />
    </div>
  );
}
