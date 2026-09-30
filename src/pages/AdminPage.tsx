import { useId, useState } from "react";
import {
  useAuthSyncs,
  useResync,
  useResyncAllFailed,
  useSystemMetrics,
} from "@/api/authSync";
import type { AuthSyncStatus } from "@/api/authSync";
import { useMe } from "@/api/me";
import { IconInfo } from "@/assets/Icons";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { QueryError } from "@/components/QueryError";
import { Skeleton } from "@/components/Skeleton";
import { Spinner } from "@/components/Spinner";
import { AdminsCard } from "@/components/AdminsCard";
import { formatRelative } from "@/lib/format";

type StatusFilter = AuthSyncStatus | "all";

const STATUS_TONE = {
  failed: "danger",
  pending: "warning",
  synced: "success",
} as const;

export function AdminPage() {
  const me = useMe();
  const [status, setStatus] = useState<StatusFilter>("failed");
  const query = useAuthSyncs({
    status: status === "all" ? undefined : status,
  });
  const resync = useResync();
  const resyncAll = useResyncAllFailed();
  const metrics = useSystemMetrics();

  if (me.isPending) {
    return <Spinner label="Checking permissions…" />;
  }

  if (!me.data?.isAdmin) {
    return (
      <EmptyState
        title="Not authorized"
        description="You don't have access to the admin area."
      />
    );
  }

  const rows = query.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-fg">Authorization sync</h1>
          <p className="text-sm text-fg-muted">
            Resources whose permissions have not converged to the auth service.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="btn"
            aria-label="Filter by status"
          >
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
            <option value="all">All</option>
          </select>
          <button
            type="button"
            className="btn btn-primary"
            disabled={resyncAll.isPending}
            onClick={() => resyncAll.mutate()}
          >
            {resyncAll.isPending ? "Retrying…" : "Retry all failed"}
          </button>
        </div>
      </div>

      {metrics.data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="Health"
            value={metrics.data.health}
            tone={metrics.data.health === "critical"
              ? "danger"
              : metrics.data.health === "degraded"
              ? "warning"
              : "success"}
            hint="Overall authorization-sync health. Ok = no failed syncs, an empty DLQ, no stuck pending row and no queue backlog; Degraded = a pending sync older than 15 min, or a queued job older than 10 min; Critical = any failed sync or anything in the DLQ."
          />
          <Stat
            label="In sync"
            value={`${metrics.data.authSync.inSyncPercent}%`}
            hint="Share of tracked resources whose permissions have converged (synced ÷ total). With no resources tracked yet it reports 100%."
          />
          <Stat
            label="Failed"
            value={metrics.data.authSync.byStatus.failed}
            hint="Resources whose last sync attempt failed. They retry automatically; permanent failures are parked in the DLQ and the owner is notified."
          />
          <Stat
            label="Pending"
            value={metrics.data.authSync.byStatus.pending}
            hint="Resources with a sync queued or in progress. One left pending for more than 15 minutes turns health Degraded."
          />
          <Stat
            label={`Queue (${metrics.data.queue.name})`}
            value={metrics.data.queue.total}
            hint={`Jobs in the pg-boss "${metrics.data.queue.name}" queue. The number counts every retained row for the queue (created, active, retry, completed), not just waiting work; a backlog older than 10 minutes affects health.`}
          />
          <Stat
            label={`DLQ (${metrics.data.dlq.name})`}
            value={metrics.data.dlq.depth}
            tone={metrics.data.dlq.depth > 0 ? "danger" : "neutral"}
            hint={`Dead-letter queue for syncs that failed permanently. Anything in "${metrics.data.dlq.name}" means permissions did not converge and forces health to Critical.`}
          />
        </div>
      ) : null}

      {resyncAll.isSuccess ? (
        <p className="text-sm text-fg-muted">
          Re-queued {resyncAll.data.count} resource(s).
        </p>
      ) : null}

      {query.isError ? (
        <QueryError error={query.error} label="authorization syncs" />
      ) : query.isPending ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing to show"
          description="No resources match this filter."
        />
      ) : (
        <div className="surface divide-y divide-border overflow-hidden">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-start justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
                  <span className="font-mono text-xs text-fg-muted">
                    {row.resourceType}:{row.resourceId}
                  </span>
                </div>
                {row.lastError ? (
                  <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all text-xs text-fg-subtle">
                    {JSON.stringify(row.lastError)}
                  </pre>
                ) : null}
                <p className="mt-1 text-xs text-fg-subtle">
                  {row.attempts} attempt(s) · updated {formatRelative(row.updatedAt)}
                </p>
              </div>
              <button
                type="button"
                className="btn shrink-0"
                disabled={resync.isPending}
                onClick={() =>
                  resync.mutate({
                    resourceType: row.resourceType,
                    resourceId: row.resourceId,
                  })}
              >
                Retry
              </button>
            </div>
          ))}
        </div>
      )}

      <AdminsCard />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "text-fg",
    success: "text-emerald-600 dark:text-emerald-300",
    warning: "text-amber-600 dark:text-amber-200",
    danger: "text-red-600 dark:text-red-300",
  }[tone];
  const hintId = useId();

  return (
    <div
      tabIndex={0}
      aria-describedby={hintId}
      className="surface group relative z-10 cursor-help p-3"
    >
      <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
        <span className="truncate">{label}</span>
        <IconInfo className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </p>
      <p className={`mt-1 text-lg font-semibold capitalize ${toneClass}`}>
        {value}
      </p>

      <span
        id={hintId}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-lg border border-border bg-surface-2 p-2.5 text-left text-xs font-normal leading-relaxed text-fg-muted opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {hint}
      </span>
    </div>
  );
}
