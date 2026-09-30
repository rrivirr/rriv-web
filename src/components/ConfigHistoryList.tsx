import { IconClock } from "@/assets/Icons";
import { creatorName } from "@/api/library";
import type { ConfigHistoryItem } from "@/api/types";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { JsonBlock } from "@/components/JsonBlock";
import { formatDate, formatRelative } from "@/lib/format";

/**
 * Applied-config history. Each row expands to show the exact config plus the
 * `changesMade` diff the API computed against the previous config of the same
 * name. Scrolls when there are many revisions.
 */
export function ConfigHistoryList({ items }: { items: ConfigHistoryItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<IconClock className="h-5 w-5" />}
        title="No config history"
        description="Applied config changes will appear here."
      />
    );
  }

  return (
    <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
      {items.map((item) => (
        <ConfigHistoryRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function ConfigHistoryRow({ item }: { item: ConfigHistoryItem }) {
  const kind = item.sensorDriverId ? "sensor" : "datalogger";
  const changes = item.changesMade ? Object.entries(item.changesMade) : [];
  const contextName = item.ConfigSnapshot?.DeviceContext?.Context?.name;

  return (
    <details className="rounded-xl border border-border bg-surface-2/30">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="flex min-w-0 items-center gap-3">
          <Badge tone="neutral">{kind}</Badge>
          <span className="truncate text-sm text-fg">{item.name}</span>
          {item.active ? <Badge tone="success">active</Badge> : null}
        </span>
        <span className="flex shrink-0 items-center gap-3 text-xs text-fg-subtle">
          {item.Creator ? (
            <span className="hidden max-w-32 truncate sm:block">
              {creatorName(item)}
            </span>
          ) : null}
          <span>
            {changes.length > 0 ? `${changes.length} change(s)` : "initial"}
          </span>
          <span>{formatRelative(item.createdAt)}</span>
        </span>
      </summary>

      <div className="space-y-4 border-t border-border px-4 py-4">
        <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <Meta label="Author" value={creatorName(item, "—")} />
          <Meta label="Applied" value={formatDate(item.createdAt)} />
          <Meta
            label="Superseded"
            value={item.deactivatedAt ? formatDate(item.deactivatedAt) : "—"}
          />
          <Meta label="Context" value={contextName ?? "—"} />
        </dl>

        {changes.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-medium text-fg-muted">
              Changes from previous version
            </p>
            <ul className="space-y-1">
              {changes.map(([key, value]) => (
                <li
                  key={key}
                  className="break-words font-mono text-xs text-fg-muted"
                >
                  <span className="text-fg">{key}</span>
                  {": "}
                  {value}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-fg-subtle">
            Initial version — no prior config of this name.
          </p>
        )}

        <JsonBlock label="Config" value={item.config} />
      </div>
    </details>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wider text-fg-subtle">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-xs text-fg">{value}</dd>
    </div>
  );
}
