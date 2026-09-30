import type { ReactNode } from "react";

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={["surface p-5 sm:p-6", className].filter(Boolean).join(" ")}>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-wide text-fg">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-xs text-fg-subtle">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>

      <div className={["mt-5", bodyClassName].filter(Boolean).join(" ")}>
        {children}
      </div>
    </section>
  );
}
