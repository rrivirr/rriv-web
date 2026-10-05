import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./client";
import { buildQuery } from "./query";
import type {
  ActiveConfig,
  ConfigHistory,
  DeviceLogItem,
  FirmwareHistoryItem,
} from "./types";

export interface HistoryWindow {
  /** Point-in-time reconstruction (server-side). */
  asAt?: string;
  /** Restrict to a window (e.g. the chart range) — ignored when `asAt` is set. */
  from?: string;
  to?: string;
  /** Pagination for the non-`asAt` history list. */
  limit?: number;
  offset?: number;
}

export const configKeys = {
  active: (deviceId: string, contextId: string) =>
    ["config", "active", deviceId, contextId] as const,
  history: (identifier: string, window: HistoryWindow) =>
    [
      "config",
      "history",
      identifier,
      window.asAt ?? null,
      window.from ?? null,
      window.to ?? null,
      window.limit ?? null,
      window.offset ?? null,
    ] as const,
  firmware: (key: string, window: HistoryWindow) =>
    [
      "firmware",
      key,
      window.asAt ?? null,
      window.from ?? null,
      window.to ?? null,
      window.limit ?? null,
      window.offset ?? null,
    ] as const,
  logs: (identifier: string, limit?: number, offset?: number) =>
    ["device-log", identifier, limit ?? null, offset ?? null] as const,
};

/**
 * The config currently applied to a device+context.
 *
 * ⚠️ Calling this has a server side effect: it lazily creates the active
 * config snapshot if none exists yet. Only call it from an explicit "view
 * config" action, never on page load.
 */
export function useActiveConfig(
  deviceId: string | undefined,
  contextId: string | undefined,
  enabled = true,
) {
  const api = useApiClient();
  return useQuery({
    queryKey: configKeys.active(deviceId ?? "", contextId ?? ""),
    queryFn: ({ signal }) =>
      api.get<ActiveConfig>(
        `/configSnapshot/active${buildQuery({ deviceId, contextId })}`,
        { signal },
      ),
    enabled: enabled && Boolean(deviceId) && Boolean(contextId),
  });
}

/**
 * Applied-config history for a device. With `asAt` the API returns the config
 * in effect at that instant (server-side point-in-time reconstruction), which
 * stays correct regardless of how much history exists. With `from`/`to` it
 * returns only the changes in that window (used to scope chart markers).
 * Without either it returns the first page (≤100 rows); paginate with
 * `limit`/`offset` via the returned list.
 */
export function useConfigHistory(
  deviceIdentifier: string | undefined,
  window: HistoryWindow = {},
  options: { enabled?: boolean } = {},
) {
  const api = useApiClient();
  return useQuery({
    queryKey: configKeys.history(deviceIdentifier ?? "", window),
    queryFn: ({ signal }) =>
      api.get<ConfigHistory>(
        `/configSnapshot/history${buildQuery({
          deviceIdentifier,
          asAt: window.asAt,
          from: window.from,
          to: window.to,
          limit: window.limit,
          offset: window.offset,
          order: "asc",
        })}`,
        { signal },
      ),
    enabled: (options.enabled ?? true) && Boolean(deviceIdentifier),
  });
}

export function useFirmwareHistory(
  params: {
    deviceId?: string;
    serialNumber?: string;
  },
  window: HistoryWindow = {},
  options: { enabled?: boolean } = {},
) {
  const api = useApiClient();
  const key = params.deviceId ?? params.serialNumber ?? "";
  return useQuery({
    queryKey: configKeys.firmware(key, window),
    queryFn: ({ signal }) =>
      api.get<FirmwareHistoryItem[]>(
        `/device/firmware/history${buildQuery({
          ...params,
          asAt: window.asAt,
          from: window.from,
          to: window.to,
          limit: window.limit,
          offset: window.offset,
        })}`,
        { signal },
      ),
    enabled: (options.enabled ?? true) && Boolean(key),
  });
}

export function useDeviceLogs(
  identifier: string | undefined,
  page: { limit?: number; offset?: number } = {},
) {
  const api = useApiClient();
  return useQuery({
    queryKey: configKeys.logs(identifier ?? "", page.limit, page.offset),
    queryFn: ({ signal }) =>
      api.get<DeviceLogItem[]>(
        `/device/log${buildQuery({
          identifier,
          limit: page.limit,
          offset: page.offset,
        })}`,
        { signal },
      ),
    enabled: Boolean(identifier),
  });
}
