import { useId, useState } from "react";
import {
  useAuthSyncs,
  useResync,
  useResyncAllFailed,
  useSystemMetrics,
} from "@/api/authSync";
import type { AuthSyncStatus, SystemMetrics } from "@/api/authSync";
import { useMe } from "@/api/me";
import { IconAlert, IconCheck, IconInfo } from "@/assets/Icons";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { Pager } from "@/components/Pager";
import { QueryError } from "@/components/QueryError";
import { Skeleton } from "@/components/Skeleton";
import { Spinner } from "@/components/Spinner";
import { AdminsCard } from "@/components/AdminsCard";
import { formatRelative } from "@/lib/format";

const PAGE_SIZE = 25;

type StatusFilter = AuthSyncStatus | "all";
type Tone = "neutral" | "success" | "warning" | "danger";

const STATUS_TONE = {
  failed: "danger",
  pending: "warning",
  synced: "success",
} as const;

const TONE_CLASS: Record<Tone, string> = {
  neutral: "text-fg",
  success: "text-emerald-600 dark:text-emerald-300",
  warning: "text-amber-600 dark:text-amber-200",
  danger: "text-red-600 dark:text-red-300",
};

/** Compact age, e.g. `45s`, `12 min`, `1h 5m`, `2d 3h`. */
function formatAge(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/** Mirrors the server's `degraded` backlog threshold (10 minutes). */
const hasBacklog = (oldestQueuedSeconds: number | null): boolean =>
  (oldestQueuedSeconds ?? 0) > 10 * 60;

export function AdminPage() {
  const me = useMe();
  const [status, setStatus] = useState<StatusFilter>("failed");
  const [offset, setOffset] = useState(0);
  const query = useAuthSyncs({
    status: status === "all" ? undefined : status,
    limit: PAGE_SIZE,
    offset,
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
  const total = query.data?.total;
  const metricsData = metrics.data;
  const byState = metricsData?.queue.byState ?? {};

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
            onChange={(event) => {
              setStatus(event.target.value as StatusFilter);
              setOffset(0);
            }}
            className="btn"
            aria-label="Filter by status"
          >
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
            <option value="synced">Synced</option>
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

      {metricsData ? (
        <>
          <HealthBanner
            health={metricsData.health}
            reasons={metricsData.healthReasons}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Metric
              label="In sync"
              value={`${metricsData.authSync.byStatus.synced} of ${metricsData.authSync.total}`}
              sub={`${metricsData.authSync.inSyncPercent}% converged`}
              tone={metricsData.authSync.total > 0 &&
                  metricsData.authSync.byStatus.synced ===
                    metricsData.authSync.total
                ? "success"
                : metricsData.authSync.total > 0
                ? "warning"
                : "neutral"}
              hint="Resources whose permissions match the auth service. The fraction is synced / total tracked."
              onClick={() => setStatus("all")}
            />
            <Metric
              label="Pending"
              value={metricsData.authSync.byStatus.pending}
              sub={metricsData.authSync.byStatus.pending > 0
                ? `oldest ${formatAge(metricsData.authSync.oldestPendingSeconds)}`
                : "none"}
              tone={metricsData.authSync.stuckPendingSeconds != null
                ? "warning"
                : "neutral"}
              hint="Resources with a sync queued or in progress. One left pending for more than 15 minutes turns health Degraded."
              onClick={() => setStatus("pending")}
            />
            <Metric
              label="Failed"
              value={metricsData.authSync.byStatus.failed}
              sub={metricsData.authSync.byStatus.failed > 0
                ? `oldest ${formatAge(metricsData.authSync.oldestFailedSeconds)}`
                : "none"}
              tone={metricsData.authSync.byStatus.failed > 0 ? "danger" : "neutral"}
              hint="Resources whose last sync attempt failed. They retry automatically; permanent failures are parked in the DLQ and the owner is notified."
              onClick={() => setStatus("failed")}
            />
            <Metric
              label="Queue"
              value={`${metricsData.queue.total} waiting`}
              sub={metricsData.queue.total > 0
                ? `created ${byState.created ?? 0} · retry ${
                  byState.retry ?? 0
                } · active ${byState.active ?? 0} · oldest ${
                  formatAge(metricsData.queue.oldestQueuedSeconds)
                }`
                : "idle"}
              tone={hasBacklog(metricsData.queue.oldestQueuedSeconds)
                ? "warning"
                : "neutral"}
              hint={`Jobs in the pg-boss "${metricsData.queue.name}" queue that have not finished yet. A backlog older than 10 minutes turns health Degraded.`}
            />
            <Metric
              label="DLQ"
              value={`${metricsData.dlq.depth} parked`}
              sub={metricsData.dlq.depth > 0
                ? `oldest ${formatAge(metricsData.dlq.oldestQueuedSeconds)}`
                : "nothing parked"}
              tone={metricsData.dlq.depth > 0 ? "danger" : "neutral"}
              hint={`Dead-letter queue for syncs that failed permanently. Anything in "${metricsData.dlq.name}" forces health to Critical and needs manual attention.`}
            />
          </div>
        </>
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

      {!query.isError && !query.isPending && rows.length > 0 ? (
        <Pager
          offset={offset}
          pageSize={PAGE_SIZE}
          count={rows.length}
          total={total}
          isFetching={query.isFetching}
          onPrev={() => setOffset((page) => Math.max(0, page - PAGE_SIZE))}
          onNext={() => setOffset((page) => page + PAGE_SIZE)}
          noun="resource"
        />
      ) : null}

      <AdminsCard />
    </div>
  );
}

function HealthBanner(
  { health, reasons }: { health: SystemMetrics["health"]; reasons: string[] },
) {
  const tone: Tone = health === "critical"
    ? "danger"
    : health === "degraded"
    ? "warning"
    : "success";
  const surface = {
    danger: "border-red-500/30 bg-red-500/10",
    warning: "border-amber-500/30 bg-amber-500/10",
    success: "border-emerald-500/30 bg-emerald-500/10",
  }[tone];
  const title = health === "critical"
    ? "Critical"
    : health === "degraded"
    ? "Degraded"
    : "Healthy";
  const detail = reasons.length > 0
    ? reasons.join(" · ")
    : "All tracked resources are in sync.";

  return (
    <div
      role="status"
      className={["surface flex items-start gap-3 border p-4", surface].join(
        " ",
      )}
    >
      {health === "ok" ? (
        <IconCheck
          className={"mt-0.5 h-5 w-5 shrink-0 " + TONE_CLASS.success}
        />
      ) : (
        <IconAlert
          className={`mt-0.5 h-5 w-5 shrink-0 ${TONE_CLASS[tone]}`}
        />
      )}
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${TONE_CLASS[tone]}`}>{title}</p>
        <p className="mt-0.5 text-sm text-fg-muted">{detail}</p>
      </div>
    </div>
  );
}

function Metric(
  { label, value, sub, hint, tone = "neutral", onClick }: {
    label: string;
    value: string | number;
    sub?: string;
    hint: string;
    tone?: Tone;
    onClick?: () => void;
  },
) {
  const hintId = useId();
  const className = [
    "surface group relative z-10 p-3 text-left",
    onClick ? "cursor-pointer transition hover:border-accent/40" : "cursor-help",
  ].join(" ");

  const body = (
    <>
      <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
        <span className="truncate">{label}</span>
        <IconInfo className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </p>
      <p className={`mt-1 text-lg font-semibold ${TONE_CLASS[tone]}`}>{value}</p>
      {sub ? (
        <p className="mt-0.5 text-xs leading-relaxed text-fg-subtle">{sub}</p>
      ) : null}
      <span
        id={hintId}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-lg border border-border bg-surface-2 p-2.5 text-left text-xs font-normal leading-relaxed text-fg-muted opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {hint}
      </span>
    </>
  );

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-describedby={hintId}
      className={className}
    >
      {body}
    </button>
  ) : (
    <div tabIndex={0} aria-describedby={hintId} className={className}>
      {body}
    </div>
  );
}
