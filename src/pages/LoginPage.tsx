import { Link, Navigate, useLocation } from "react-router";
import { IconActivity, IconFlask, IconLeaf, IconWaves } from "@/assets/Icons";
import { Logo } from "@/assets/Logo";
import { WaveField } from "@/assets/WaveField";
import { useAuth } from "@/auth/useAuth";
import { Spinner } from "@/components/Spinner";
import { ThemeToggle } from "@/components/ThemeToggle";

const HIGHLIGHTS = [
  {
    icon: IconLeaf,
    title: "Low cost, user customizable",
    body: "Open hardware and software for water body monitoring and citizen science.",
  },
  {
    icon: IconActivity,
    title: "See change over time",
    body: "Log dense data to understand how restoration and pollution affect a watershed.",
  },
  {
    icon: IconFlask,
    title: "Research and prototype",
    body: "Bench experiments, mesocosms, and spatially dense field deployments.",
  },
];

export function LoginPage() {
  const { status, error, signin } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/contexts";

  if (status === "authenticated") {
    return <Navigate to={from} replace />;
  }

  const busy = status === "loading";

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Top bar: home link + theme toggle */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" aria-label="RRIV home">
          <Logo />
        </Link>
        <ThemeToggle />
      </div>

      {/* ------------------------------------------------------- Brand panel */}
      <aside className="relative hidden overflow-hidden border-r border-border px-12 pb-12 pt-24 lg:flex lg:flex-col lg:justify-between">
        <WaveField className="pointer-events-none absolute inset-0 h-full w-full opacity-80" />
        <div className="grid-backdrop pointer-events-none absolute inset-0" />

        <div className="relative max-w-md">
          <span className="pill">
            <IconWaves className="h-3.5 w-3.5 text-accent" />
            Environmental monitoring
          </span>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight text-fg">
            The river is at <span className="text-gradient">the center</span>.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-fg-muted">
            RRIV is a user-centric, open platform for environmental monitoring
            and awareness — affordable sensing for rivers, lakes and wetlands.
          </p>

          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
                  <item.icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-sm font-medium text-fg">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-fg-subtle">
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs uppercase tracking-[0.2em] text-fg-subtle">
          River Restoration Intelligence &amp; Verification
        </p>
      </aside>

      {/* ---------------------------------------------------------- Sign in */}
      <main className="relative flex items-center justify-center px-4 py-24 sm:px-8">
        <div className="grid-backdrop pointer-events-none absolute inset-0 lg:hidden" />

        <div className="relative w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight text-fg">
            Sign in
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            Continue to your RRIV dashboard
          </p>

          <button
            type="button"
            onClick={() => void signin()}
            disabled={busy}
            className="btn btn-primary mt-8 w-full"
          >
            {busy ? (
              <Spinner />
            ) : (
              <>
                <span
                  aria-hidden="true"
                  className="grid h-5 w-5 place-items-center rounded-full bg-brand-950/15"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none">
                    <path
                      d="M12 3a9 9 0 1 0 9 9"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M21 3v6h-6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                Sign in
              </>
            )}
          </button>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300"
            >
              {error}
            </p>
          ) : null}

          <p className="mt-6 text-center text-sm text-fg-muted">
            New to RRIV?{" "}
            <Link
              to="/signup"
              className="font-medium text-accent transition hover:opacity-80"
            >
              Create an account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
