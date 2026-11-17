import { Link } from "react-router";
import { IconArrowRight, IconExternal } from "@/assets/Icons";
import researchJars from "@/assets/images/research-jars.jpg";
import sondeCase from "@/assets/images/sonde-case.jpg";
import wiringDiagram from "@/assets/images/wiring-diagram.png";
import { InfoPage } from "@/components/InfoPage";

const DOCS_URL = "https://rriv.gitbook.io/rriv-documentation/";
const GITHUB_URL = "https://github.com/rrivirr";

const USES = [
  {
    title: "Monitoring",
    tagline: "at high spatial density",
    to: "/monitoring",
    image: {
      src: sondeCase,
      alt: "RRIV waterproof sonde case with a mesh sensor guard",
    },
  },
  {
    title: "Prototyping",
    tagline: "to build new sensing applications",
    to: "/prototyping",
    image: {
      src: wiringDiagram,
      alt: "Wiring diagram for a prototype with temperature, humidity and methane sensors",
    },
  },
  {
    title: "Research",
    tagline: "field, bench, mesocosm, data",
    image: {
      src: researchJars,
      alt: "Five sealed mason-jar experiments, each wired to its own RRIV board and battery pack",
    },
  },
];

export function UseCasesPage() {
  return (
    <InfoPage title="Use cases">
      <div className="grid gap-6 sm:grid-cols-3">
        {USES.map((use) => {
          const body = (
            <>
              <img
                src={use.image.src}
                alt={use.image.alt}
                loading="lazy"
                className="aspect-[4/3] w-full rounded-xl border border-border bg-white object-cover"
              />
              <h2 className="mt-4 text-base font-semibold text-fg">{use.title}</h2>
              <p className="mt-1 text-sm text-fg-muted">{use.tagline}</p>
            </>
          );
          return use.to ? (
            <Link
              key={use.title}
              to={use.to}
              className="surface surface-interactive flex flex-col p-4"
            >
              {body}
            </Link>
          ) : (
            <article key={use.title} className="surface flex flex-col p-4">
              {body}
            </article>
          );
        })}
      </div>

      <section className="surface mt-10 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-fg">Get started</h2>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary"
          >
            System documentation
            <IconArrowRight className="h-4 w-4" />
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
          >
            RRIV on GitHub
            <IconExternal className="h-4 w-4" />
          </a>
        </div>
      </section>
    </InfoPage>
  );
}
