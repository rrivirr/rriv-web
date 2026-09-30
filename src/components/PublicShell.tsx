import { Link, Outlet } from "react-router";
import { Logo } from "@/assets/Logo";
import { SiteFooter } from "./SiteFooter";
import { ThemeToggle } from "./ThemeToggle";

/** Public chrome for the landing, sign-in and sign-up screens. */
export function PublicShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="RRIV home" className="shrink-0">
            <Logo />
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/login" className="btn btn-ghost px-3 py-2">
              Sign in
            </Link>
            <Link to="/signup" className="btn btn-primary hidden sm:inline-flex">
              Create account
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <SiteFooter />
    </div>
  );
}
