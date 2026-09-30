/** Pretty-printed JSON block used for library config payloads. */
export function JsonBlock({
  value,
  label,
}: {
  value: unknown;
  label?: string;
}) {
  return (
    <div>
      {label ? (
        <p className="mb-1.5 text-xs font-medium text-fg-muted">{label}</p>
      ) : null}
      <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-surface-2/50 p-3 font-mono text-xs leading-relaxed text-fg-muted">
        {JSON.stringify(value ?? null, null, 2)}
      </pre>
    </div>
  );
}
