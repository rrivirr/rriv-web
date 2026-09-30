import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { children: ReactNode };

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** River waves — used for contexts and branding accents. */
export function IconWaves(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M2 7c2.4 0 3.6-2 6-2s3.6 2 6 2 3.6-2 6-2" />
      <path d="M2 13c2.4 0 3.6-2 6-2s3.6 2 6 2 3.6-2 6-2" />
      <path d="M2 19c2.4 0 3.6-2 6-2s3.6 2 6 2 3.6-2 6-2" />
    </Base>
  );
}

/** Telemetry pulse — used for devices. */
export function IconActivity(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M3 12h3.5l2-5 3 10 2.5-7 1.5 2H21" />
    </Base>
  );
}

/** Stacked layers — library and configuration groups. */
export function IconLayers(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </Base>
  );
}

export function IconExternal(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Base>
  );
}

export function IconLogOut(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
      <path d="M10 17l-5-5 5-5" />
      <path d="M5 12h11" />
    </Base>
  );
}

export function IconChevronDown(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="m6 9 6 6 6-6" />
    </Base>
  );
}

export function IconArrowRight(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Base>
  );
}

export function IconLeaf(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 10-5 13-9 13Z" />
      <path d="M4 20c2-4 5-7 12-11" />
    </Base>
  );
}

export function IconFlask(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M9 3h6" />
      <path d="M10 3v6.5L5 18a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-8.5V3" />
      <path d="M7.5 14h9" />
    </Base>
  );
}

export function IconMapPin(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </Base>
  );
}

export function IconClock(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </Base>
  );
}

export function IconSun(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Base>
  );
}

export function IconMoon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </Base>
  );
}

export function IconUserPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M18 8v6M15 11h6" />
    </Base>
  );
}

export function IconArrowLeft(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </Base>
  );
}

export function IconCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="m4 12.5 5 5L20 6.5" />
    </Base>
  );
}

export function IconAlert(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v5" />
      <path d="M12 17.5h.01" />
    </Base>
  );
}

/** Circle with an "i" — inline help / tooltip affordance. */
export function IconInfo(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.5h.01" />
    </Base>
  );
}

/** Magnifier — used by the library search controls. */
export function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Base>
  );
}

/** Circular arrows — refresh / refetch controls. */
export function IconRefresh(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M20 11a8 8 0 0 0-13.7-5.7L4 7" />
      <path d="M4 4v3h3" />
      <path d="M4 13a8 8 0 0 0 13.7 5.7L20 17" />
      <path d="M20 20v-3h-3" />
    </Base>
  );
}
