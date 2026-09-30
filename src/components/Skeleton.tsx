export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "block animate-pulse rounded-md bg-fg-muted/20",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
