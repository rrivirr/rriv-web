import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./client";
import { type LibraryKind, libraryBase } from "./library";
import { savedSnapshotKeys } from "./savedSnapshots";
import type { LibraryConfigSummary } from "./types";

/** What gets published: a device's (or saved snapshot's) datalogger and sensors. */
export interface PublishContent {
  datalogger: Record<string, unknown> | null;
  sensors: { name: string; config: Record<string, unknown> }[];
}

/** Which part of the content goes into the library. */
export type PublishScope =
  | { kind: "system" }
  | { kind: "datalogger" }
  | { kind: "sensor"; sensorName: string };

/**
 * The request body for a new library config (`version: false`) or a new
 * version of one (`version: true`), in each library's own shape. `null` when
 * the content doesn't have what the scope needs.
 */
export function publishBody(
  scope: PublishScope,
  content: PublishContent,
  extras: { name?: string; description?: string; firmwareVersion?: string | null },
  version: boolean,
): Record<string, unknown> | null {
  const common = {
    ...(version ? {} : { name: extras.name }),
    ...(extras.description ? { description: extras.description } : {}),
    ...(extras.firmwareVersion ? { firmwareVersion: extras.firmwareVersion } : {}),
  };
  if (scope.kind === "datalogger") {
    return content.datalogger ? { ...common, config: content.datalogger } : null;
  }
  if (scope.kind === "sensor") {
    const sensor = content.sensors.find((entry) => entry.name === scope.sensorName);
    return sensor ? { ...common, sensorName: sensor.name, config: sensor.config } : null;
  }
  if (!content.datalogger && !content.sensors.length) return null;
  return {
    ...common,
    datalogger: content.datalogger ?? {},
    sensors: content.sensors.map((sensor) => ({ ...sensor.config, name: sensor.name })),
  };
}

const invalidateLibrary = (client: ReturnType<typeof useQueryClient>) =>
  client.invalidateQueries({ queryKey: ["library"] });

/** Publish as a new library config; resolves to the created config. */
export function useCreateLibraryConfig() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, body }: { kind: LibraryKind; body: Record<string, unknown> }) =>
      api.post<LibraryConfigSummary>(libraryBase(kind), body),
    onSuccess: () => invalidateLibrary(client),
  });
}

/** Publish as the next version of one of your library configs. */
export function usePublishLibraryVersion() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id, body }: { kind: LibraryKind; id: string; body: Record<string, unknown> }) =>
      api.post<void>(`${libraryBase(kind)}/${id}/version`, body),
    onSuccess: () => invalidateLibrary(client),
  });
}

/** The owner's edits: name, description, public/private. */
export function useUpdateLibraryConfig() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      id,
      changes,
    }: {
      kind: LibraryKind;
      id: string;
      changes: { name?: string; description?: string | null; isPublic?: boolean };
    }) => api.patch<LibraryConfigSummary>(`${libraryBase(kind)}/${id}`, changes),
    onSuccess: () => invalidateLibrary(client),
  });
}

/** Archive one of your library configs (hidden from browsing, history kept). */
export function useArchiveLibraryConfig() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id }: { kind: LibraryKind; id: string }) =>
      api.delete<void>(`${libraryBase(kind)}/${id}`),
    onSuccess: () => invalidateLibrary(client),
  });
}

/** Admins: mark a library config as an official RRIV config (also makes it public), or unmark it. */
export function useSetLibraryOfficial() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id, isOfficial }: { kind: LibraryKind; id: string; isOfficial: boolean }) =>
      api.patch<LibraryConfigSummary>(`/admin/libraryConfig/${kind}/${id}`, { isOfficial }),
    onSuccess: () => invalidateLibrary(client),
  });
}

export function useRenameSavedSnapshot() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch<{ id: string; name: string }>(`/configSnapshot/${id}`, { name }),
    onSuccess: () => client.invalidateQueries({ queryKey: savedSnapshotKeys.list }),
  });
}

export function useDeleteSavedSnapshot() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/configSnapshot/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: savedSnapshotKeys.list }),
  });
}
