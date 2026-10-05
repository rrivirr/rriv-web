import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./client";

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  resourceType: string | null;
  resourceId: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationList {
  items: NotificationRow[];
  total: number;
  unread: number;
}

export function useNotifications(
  params: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["notifications", params],
    queryFn: ({ signal }) =>
      api.get<NotificationList>(
        `/notification?unread=${params.unreadOnly ? "true" : "false"}&limit=${
          params.limit ?? 20
        }&offset=${params.offset ?? 0}`,
        { signal },
      ),
  });
}

/** Lightweight poll for the header badge. */
export function useUnreadCount() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: ({ signal }) =>
      api.get<NotificationList>("/notification?unread=true&limit=1", {
        signal,
      }),
    select: (data) => data.unread,
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/notification/${id}/read`),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/notification/read-all"),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
