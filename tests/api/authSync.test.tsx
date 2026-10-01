import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import {
  useAuthSyncs,
  useResync,
  useResyncAllFailed,
  useSystemMetrics,
} from "@/api/authSync";
import { createTestQueryClient, hookWrapper } from "../helpers/render";
import { server } from "../helpers/server";

const api = "http://api.test";

const metrics = {
  generatedAt: "2026-01-01T00:00:00Z",
  health: "degraded",
  healthReasons: ["a sync has been pending for 22 min"],
  authSync: {
    byStatus: { pending: 1, synced: 2, failed: 1 },
    total: 4,
    oldestFailedSeconds: 10,
    oldestPendingSeconds: 1320,
    stuckPendingSeconds: 1320,
    inSyncPercent: 50,
  },
  queue: {
    name: "sync",
    available: true,
    total: 1,
    byState: { created: 1 },
    oldestQueuedSeconds: null,
  },
  dlq: {
    name: "dlq",
    available: true,
    depth: 0,
    byState: {},
    oldestQueuedSeconds: null,
  },
  notifications: { unread: 1 },
  recentFailures: [],
};

describe("useSystemMetrics", () => {
  it("loads admin metrics", async () => {
    server.use(http.get(`${api}/admin/metrics`, () => HttpResponse.json(metrics)));

    const { result } = renderHook(() => useSystemMetrics(), {
      wrapper: hookWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.authSync.total).toBe(4);
  });
});

describe("useAuthSyncs", () => {
  it("serializes filters", async () => {
    let search = "";
    server.use(
      http.get(`${api}/admin/auth-sync`, ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json({ items: [], total: 0 });
      }),
    );

    const { result } = renderHook(
      () => useAuthSyncs({ status: "failed", limit: 20 }),
      { wrapper: hookWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(search).toContain("status=failed");
    expect(search).toContain("limit=20");
  });
});

describe("resync mutations", () => {
  it("resyncs one resource and invalidates auth-sync", async () => {
    let path = "";
    server.use(
      http.post(`${api}/admin/auth-sync/:type/:id/resync`, ({ request }) => {
        path = new URL(request.url).pathname;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useResync(), {
      wrapper: hookWrapper(queryClient),
    });

    await result.current.mutateAsync({ resourceType: "context", resourceId: "c1" });
    expect(path).toBe("/admin/auth-sync/context/c1/resync");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["auth-sync"] });
  });

  it("resyncs all failed", async () => {
    server.use(
      http.post(`${api}/admin/auth-sync/resync-failed`, () =>
        HttpResponse.json({ count: 3 }),
      ),
    );

    const { result } = renderHook(() => useResyncAllFailed(), {
      wrapper: hookWrapper(),
    });

    await expect(result.current.mutateAsync()).resolves.toEqual({ count: 3 });
  });
});
