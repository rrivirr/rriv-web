import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "@/api/notifications";
import { createTestQueryClient, hookWrapper } from "../helpers/render";
import { server } from "../helpers/server";

const notificationsUrl = "http://api.test/notification";

const row = {
  id: "n1",
  type: "AUTH_SYNC_FAILED",
  title: "Failed",
  body: null,
  resourceType: null,
  resourceId: null,
  readAt: null,
  createdAt: "2026-01-01T00:00:00Z",
};

describe("useNotifications", () => {
  it("requests unread/limit parameters", async () => {
    let search = "";
    server.use(
      http.get(notificationsUrl, ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json({ items: [row], total: 1, unread: 1 });
      }),
    );

    const { result } = renderHook(
      () => useNotifications({ unreadOnly: true, limit: 5 }),
      { wrapper: hookWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(search).toContain("unread=true");
    expect(search).toContain("limit=5");
    expect(result.current.data?.items).toHaveLength(1);
  });
});

describe("useUnreadCount", () => {
  it("selects the unread number", async () => {
    server.use(
      http.get(notificationsUrl, () =>
        HttpResponse.json({ items: [row], total: 3, unread: 3 }),
      ),
    );

    const { result } = renderHook(() => useUnreadCount(), {
      wrapper: hookWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBe(3));
  });
});

describe("notification mutations", () => {
  it("marks one read and invalidates the list", async () => {
    let path = "";
    server.use(
      http.post(`${notificationsUrl}/:id/read`, ({ request }) => {
        path = new URL(request.url).pathname;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useMarkNotificationRead(), {
      wrapper: hookWrapper(queryClient),
    });

    await result.current.mutateAsync("n1");
    expect(path).toBe("/notification/n1/read");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications"] });
  });

  it("marks all read", async () => {
    let path = "";
    server.use(
      http.post(`${notificationsUrl}/read-all`, ({ request }) => {
        path = new URL(request.url).pathname;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { result } = renderHook(() => useMarkAllNotificationsRead(), {
      wrapper: hookWrapper(),
    });

    await result.current.mutateAsync();
    expect(path).toBe("/notification/read-all");
  });
});
