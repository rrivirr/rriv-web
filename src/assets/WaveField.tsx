import { useId } from "react";

/**
 * Generated, animated river-wave backdrop. Purely decorative; drifts slowly
 * via CSS keyframes and respects reduced-motion through the base styles.
 */
export function WaveField({ className }: { className?: string }) {
  const glow = useId();
  const near = useId();
  const far = useId();

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      viewBox="0 0 1440 640"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id={glow} cx="50%" cy="8%" r="75%">
          <stop offset="0%" stopColor="var(--color-brand-400)" stopOpacity="0.30" />
          <stop offset="45%" stopColor="var(--color-brand-700)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="var(--color-abyss)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={near} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-brand-300)" stopOpacity="0" />
          <stop offset="45%" stopColor="var(--color-brand-300)" stopOpacity="0.65" />
          <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={far} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-brand-600)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--color-brand-500)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--color-brand-700)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="1440" height="640" fill={`url(#${glow})`} />

      <g className="animate-drift-slow" fill="none" stroke={`url(#${far})`} strokeWidth="1.5">
        <path d="M-60 380 C 240 300, 480 460, 760 380 S 1240 300, 1500 380" />
        <path d="M-60 430 C 240 350, 480 510, 760 430 S 1240 350, 1500 430" opacity="0.7" />
      </g>

      <g className="animate-drift" fill="none" stroke={`url(#${near})`} strokeWidth="2">
        <path d="M-60 490 C 240 410, 480 570, 760 490 S 1240 410, 1500 490" />
        <path d="M-60 545 C 240 465, 480 625, 760 545 S 1240 465, 1500 545" opacity="0.6" />
      </g>
    </svg>
  );
}
