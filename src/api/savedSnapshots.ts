import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./client";
import type { LibrarySnapshotRef } from "./types";

/**
 * A saved snapshot (`POST /configSnapshot/save`): a private, named copy of a
 * device's cloud config at the time, the datalogger and every sensor.
 */
export interface SavedSnapshot extends LibrarySnapshotRef {
  createdAt?: string;
}

export const savedSnapshotKeys = {
  list: ["saved-snapshots"] as const,
  detail: (id: string) => ["saved-snapshots", id] as const,
};

/** Your saved snapshots, by name (up to the API's page limit). */
export function useSavedSnapshots(enabled = true) {
  const api = useApiClient();
  return useQuery({
    queryKey: savedSnapshotKeys.list,
    queryFn: ({ signal }) =>
      api.get<SavedSnapshot[]>("/configSnapshot?limit=100&orderBy=name&order=asc", { signal }),
    enabled,
  });
}

/** One of your saved snapshots; `null` if it isn't yours or doesn't exist. */
export function useSavedSnapshot(id: string | undefined) {
  const api = useApiClient();
  return useQuery({
    queryKey: savedSnapshotKeys.detail(id ?? ""),
    queryFn: async ({ signal }) => {
      const [found] = await api.get<SavedSnapshot[]>(
        `/configSnapshot?${new URLSearchParams({ id: id! })}`,
        { signal },
      );
      return found ?? null;
    },
    enabled: Boolean(id),
  });
}
