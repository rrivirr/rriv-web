import { useState } from "react";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/api/notifications";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { Pager } from "@/components/Pager";
import { QueryError } from "@/components/QueryError";
import { Skeleton } from "@/components/Skeleton";
import { formatRelative } from "@/lib/format";

const PAGE_SIZE = 20;

export function NotificationsPage() {
  const [offset, setOffset] = useState(0);
  const query = useNotifications({ limit: PAGE_SIZE, offset });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const rows = query.data?.items ?? [];
  const total = query.data?.total;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-fg">Notifications</h1>
          <p className="text-sm text-fg-muted">
            Background actions that need your attention.
          </p>
        </div>
        {rows.some((row) => !row.readAt) ? (
          <button
            type="button"
            className="btn"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Mark all read
          </button>
        ) : null}
      </div>

      {query.isError ? (
        <QueryError error={query.error} label="notifications" />
      ) : query.isPending ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No notifications"
          description="You're all caught up."
        />
      ) : (
        <div className="surface divide-y divide-border overflow-hidden">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-start justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {!row.readAt ? <Badge tone="brand">New</Badge> : null}
                  <p className="text-sm font-medium text-fg">{row.title}</p>
                </div>
                {row.body ? (
                  <p className="mt-1 break-words text-sm text-fg-muted">
                    {row.body}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-fg-subtle">
                  {formatRelative(row.createdAt)}
                </p>
              </div>
              {!row.readAt ? (
                <button
                  type="button"
                  className="btn shrink-0"
                  disabled={markRead.isPending}
                  onClick={() => markRead.mutate(row.id)}
                >
                  Mark read
                </button>
              ) : null}
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
          noun="notification"
        />
      ) : null}
    </div>
  );
}
