import type { ReactNode } from "react";
import { Link } from "react-router";
import { IconArrowLeft } from "@/assets/Icons";

/** Layout for the public project pages (Monitoring, Use cases, …). */
export function InfoPage({
  banner,
  title,
  intro,
  children,
}: {
  /** Decorative landscape photo across the top. */
  banner?: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="animate-rise">
      {banner ? (
        <img
          src={banner}
          alt=""
          className="h-36 w-full border-b border-border object-cover sm:h-56"
        />
      ) : null}

      <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs font-medium text-fg-subtle transition hover:text-accent"
        >
          <IconArrowLeft className="h-3.5 w-3.5" />
          Home
        </Link>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          {title}
        </h1>

        {intro ? (
          <div className="mt-4 space-y-4 text-base leading-relaxed text-fg-muted">
            {intro}
          </div>
        ) : null}

        <div className="mt-10">{children}</div>
      </div>
    </div>
  );
}

export type InfoPoint = {
  title: string;
  body: string;
  image?: { src: string; alt: string };
};

/** Numbered feature cards; a point with an image shows it beside the text. */
export function NumberedPoints({ points }: { points: InfoPoint[] }) {
  return (
    <ol className="grid gap-5">
      {points.map((point, index) => (
        <li
          key={point.title}
          className="surface flex flex-col gap-5 p-6 sm:flex-row sm:items-start"
        >
          <div className="flex flex-1 gap-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/10 text-sm font-semibold text-accent">
              {index + 1}
            </span>
            <div>
              <h2 className="text-base font-semibold text-fg">{point.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                {point.body}
              </p>
            </div>
          </div>
          {point.image ? (
            <img
              src={point.image.src}
              alt={point.image.alt}
              loading="lazy"
              className="w-full rounded-xl border border-border bg-white object-contain sm:w-64"
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
