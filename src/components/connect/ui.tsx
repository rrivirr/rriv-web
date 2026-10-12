import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

/** The app's shared `.btn` / `.field` styles, compacted for dense tool panels. */
export const button = "btn btn-ghost px-3 py-1.5";
export const primary = "btn btn-primary px-3 py-1.5";
export const danger = "btn btn-ghost px-3 py-1.5 text-red-600 dark:text-red-300";
export const input = "field py-1.5";
export const label = "text-[11px] uppercase tracking-wide text-fg-subtle";

const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

export function Field({ label: name, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className={label}>{name}</dt>
      <dd className="mt-0.5 break-all font-mono text-sm text-fg">{value ?? "—"}</dd>
    </div>
  );
}

export type CalloutTone = "info" | "success" | "warning" | "danger";

export function Callout({
  tone,
  children,
  action,
}: {
  tone: CalloutTone;
  children: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    info: "border-border bg-surface-2/60 text-fg-muted",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
    danger: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  } as const;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}
    >
      <div className="min-w-0">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export interface Feedback {
  tone: CalloutTone;
  message: ReactNode;
  action?: ReactNode;
}

/**
 * One async action at a time, with a label for the button that is running and
 * a single feedback slot (success, warning or error) for the panel.
 */
export function useTask() {
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    // Set on every mount, not just the first: StrictMode (dev) mounts,
    // unmounts and remounts, and a flag left false would swallow every result.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (name: string, task: () => Promise<Feedback | void>) => {
      setBusy(name);
      setFeedback(null);
      try {
        const result = await task();
        if (mounted.current && result) setFeedback(result);
      } catch (cause) {
        if (mounted.current) setFeedback({ tone: "danger", message: errorText(cause) });
      } finally {
        if (mounted.current) setBusy(null);
      }
    },
    [],
  );

  return { busy, feedback, setFeedback, run };
}

export function FeedbackCallout({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;
  return (
    <Callout tone={feedback.tone} action={feedback.action}>
      {feedback.message}
    </Callout>
  );
}

/** A destructive button that asks for a second click before acting. */
export function ConfirmButton({
  children,
  confirmLabel = "Click again to confirm",
  onConfirm,
  disabled,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <button
      type="button"
      className={danger}
      disabled={disabled}
      aria-label={armed ? confirmLabel : ariaLabel}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

export interface TabItem<T extends string> {
  id: T;
  label: string;
  badge?: ReactNode;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Board tools"
      className="flex gap-1 overflow-x-auto border-b border-border"
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={[
              "-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm transition",
              selected
                ? "border-accent font-medium text-fg"
                : "border-transparent text-fg-muted hover:text-fg",
            ].join(" ")}
          >
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className="space-y-5">
      {children}
    </div>
  );
}

export function StatusDot({ tone }: { tone: "success" | "warning" | "danger" | "neutral" | "brand" }) {
  const tones = {
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-red-500",
    neutral: "bg-fg-subtle",
    brand: "bg-accent animate-pulse",
  } as const;
  return <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${tones[tone]}`} />;
}
