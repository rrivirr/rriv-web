import { useId } from "react";

/**
 * Hand-authored RRIV logo mark: a rounded "sensor" tile over two river waves.
 * Generated for this project — no external asset dependency.
 */
export function LogoMark({ className }: { className?: string }) {
  const gradientId = useId();

  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="RRIV"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-300)" />
          <stop offset="100%" stopColor="var(--color-brand-600)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill={`url(#${gradientId})`} />
      <g
        fill="none"
        stroke="var(--color-brand-950)"
        strokeWidth="2.6"
        strokeLinecap="round"
      >
        <path d="M10 18c3.5 0 5-3 9-3s5.5 3 9 3 5-3 9-3" opacity="0.9" />
        <path d="M10 26c3.5 0 5-3 9-3s5.5 3 9 3 5-3 9-3" opacity="0.6" />
      </g>
      <circle cx="34" cy="34" r="4" fill="var(--color-brand-950)" />
      <circle cx="34" cy="34" r="1.6" fill="var(--color-brand-300)" />
    </svg>
  );
}

/** Logo mark plus the RRIV wordmark, for page headers and the login card. */
export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={["inline-flex items-center gap-3", className].join(" ")}>
      <LogoMark className="h-9 w-9 shrink-0" />
      {showWordmark ? (
        <span className="text-xl font-semibold uppercase tracking-[0.35em] text-fg">
          RRIV
        </span>
      ) : null}
    </span>
  );
}
