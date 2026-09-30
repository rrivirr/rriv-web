import { Navigate, Outlet, useLocation } from "react-router";
import { Spinner } from "@/components/Spinner";
import { useAuth } from "./useAuth";

/** Gates protected routes; unauthenticated users are sent to the login screen. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label="Checking your session…" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
