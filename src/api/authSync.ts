import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./client";
import { buildQuery } from "./query";

export type AuthResourceType = "context" | "account";
export type AuthSyncStatus = "pending" | "synced" | "failed";

export interface AuthSyncRow {
  id: string;
  resourceType: AuthResourceType;
  resourceId: string;
  status: AuthSyncStatus;
  attempts: number;
  lastError: unknown;
  lastJobId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSyncFilters {
  status?: AuthSyncStatus;
  resourceType?: AuthResourceType;
  limit?: number;
  offset?: number;
}

export interface SystemMetrics {
  generatedAt: string;
  health: "ok" | "degraded" | "critical";
  /** Plain-language reasons health isn't `ok` (empty when it is). */
  healthReasons: string[];
  authSync: {
    byStatus: { pending: number; synced: number; failed: number };
    total: number;
    oldestFailedSeconds: number | null;
    oldestPendingSeconds: number | null;
    stuckPendingSeconds: number | null;
    inSyncPercent: number;
  };
  queue: {
    name: string;
    available: boolean;
    total: number;
    byState: Record<string, number>;
    oldestQueuedSeconds: number | null;
  };
  dlq: {
    name: string;
    available: boolean;
    depth: number;
    byState: Record<string, number>;
    oldestQueuedSeconds: number | null;
  };
  notifications: { unread: number };
  recentFailures: Array<{
    resourceType: string;
    resourceId: string;
    attempts: number;
    lastError: unknown;
    updatedAt: string;
  }>;
}

export const authSyncKeys = {
  list: (filters: AuthSyncFilters) => ["auth-sync", filters] as const,
};

export function useSystemMetrics() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["admin", "metrics"],
    queryFn: ({ signal }) =>
      api.get<SystemMetrics>("/admin/metrics", { signal }),
    refetchInterval: 30_000,
  });
}

export function useAuthSyncs(filters: AuthSyncFilters = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: authSyncKeys.list(filters),
    queryFn: ({ signal }) =>
      api.get<{ items: AuthSyncRow[]; total: number }>(
        `/admin/auth-sync${buildQuery({ ...filters })}`,
        { signal },
      ),
  });
}

export function useResync() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      { resourceType, resourceId }: {
        resourceType: AuthResourceType;
        resourceId: string;
      },
    ) =>
      api.post(
        `/admin/auth-sync/${resourceType}/${resourceId}/resync`,
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ["auth-sync"] }),
  });
}

export function useResyncAllFailed() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ count: number }>("/admin/auth-sync/resync-failed"),
    onSuccess: () => client.invalidateQueries({ queryKey: ["auth-sync"] }),
  });
}
