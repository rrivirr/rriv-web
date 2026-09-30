import { Link, Navigate } from "react-router";
import {
  IconArrowRight,
  IconExternal,
  IconFlask,
  IconLeaf,
  IconWaves,
} from "@/assets/Icons";
import { WaveField } from "@/assets/WaveField";
import { useAuth } from "@/auth/useAuth";
import { Spinner } from "@/components/Spinner";

const RRIV_ORG = "https://rriv.org";

const PILLARS = [
  {
    icon: IconLeaf,
    title: "Low cost monitoring",
    body: "Open source and DIY technologies dramatically lower the cost of monitoring river, lake and wetland water quality, making dense deployments accessible to operators at many skill levels.",
  },
  {
    icon: IconWaves,
    title: "Understand and protect",
    body: "Long-term impacts of restoration or pollution events are invisible without change logged over time. Dense data shows how actions affect the river, enabling accountability.",
  },
  {
    icon: IconFlask,
    title: "Research and prototyping",
    body: "Run bench experiments, automated mesocosms and spatially dense field deployments, or prototype new sensing instruments with plentiful I/O and runtime reconfiguration.",
  },
];

/** Small, secondary outbound links — deliberately quiet. */
const EXPLORE = [
  { href: `${RRIV_ORG}/monitoring.html`, label: "Monitoring" },
  { href: `${RRIV_ORG}/use.html`, label: "Use cases" },
  { href: `${RRIV_ORG}/prototyping.html`, label: "Prototyping" },
  { href: `${RRIV_ORG}/citizen-science.html`, label: "Citizen science" },
  { href: `${RRIV_ORG}/contribute.html`, label: "Contribute" },
];

export function LandingPage() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div className="grid min-h-[60dvh] place-items-center">
        <Spinner label="Loading…" />
      </div>
    );
  }

  if (status === "authenticated") {
    return <Navigate to="/contexts" replace />;
  }

  return (
    <div className="animate-rise">
      {/* ------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <WaveField className="pointer-events-none absolute inset-0 h-full w-full opacity-80" />
        <div className="grid-backdrop pointer-events-none absolute inset-0" />

        <div className="relative mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <span className="pill">
            <IconWaves className="h-3.5 w-3.5 text-accent" />
            River Restoration Intelligence &amp; Verification
          </span>

          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-fg sm:text-6xl">
            The river is at <span className="text-gradient">the center</span>.
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-fg-muted sm:text-lg">
            RRIV is a user-centric, open platform for environmental monitoring
            and awareness — a low-cost, user-customizable way to monitor rivers,
            lakes and wetlands at dense spatial scales.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/signup" className="btn btn-primary">
              Create account
              <IconArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/login" className="btn btn-ghost">
              Sign in
            </Link>
          </div>

          <p className="mt-8 max-w-xl text-xs leading-relaxed text-fg-subtle">
            Rivers feed lakes, wetlands, oceans, animals, and people. Healthy
            watersheds remain a fundamental requirement for our survival.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------- Pillars */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-fg">
          Built for watersheds
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">
          As climate disruption and intensive land use transform our planet,
          RRIV makes dense water-quality observation affordable, accessible and
          operator-friendly.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {PILLARS.map((pillar) => (
            <article
              key={pillar.title}
              className="surface surface-interactive flex flex-col p-6"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
                <pillar.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-fg">
                {pillar.title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-fg-muted">
                {pillar.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- Explore */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <div className="surface flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-fg">Explore RRIV</h2>
            <p className="mt-1 text-xs text-fg-subtle">
              Learn more on the project site.
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {EXPLORE.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted transition hover:text-accent"
              >
                {link.label}
                <IconExternal className="h-3 w-3" />
              </a>
            ))}
          </nav>
        </div>
      </section>
    </div>
  );
}
