import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./client";
import { buildQuery } from "./query";
import type {
  ActiveConfig,
  ConfigHistory,
  DeviceLogItem,
  FirmwareHistoryItem,
} from "./types";

export const configKeys = {
  active: (deviceId: string, contextId: string) =>
    ["config", "active", deviceId, contextId] as const,
  history: (identifier: string, asAt: string | undefined) =>
    ["config", "history", identifier, asAt ?? null] as const,
  firmware: (key: string) => ["firmware", key] as const,
  logs: (identifier: string) => ["device-log", identifier] as const,
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
 * Applied-config history for a device, oldest first. With `asAt` the API
 * returns the config active at that instant (point-in-time reconstruction).
 */
export function useConfigHistory(
  deviceIdentifier: string | undefined,
  asAt?: string,
) {
  const api = useApiClient();
  return useQuery({
    queryKey: configKeys.history(deviceIdentifier ?? "", asAt),
    queryFn: ({ signal }) =>
      api.get<ConfigHistory>(
        `/configSnapshot/history${buildQuery({
          deviceIdentifier,
          asAt,
          order: "asc",
        })}`,
        { signal },
      ),
    enabled: Boolean(deviceIdentifier),
  });
}

export function useFirmwareHistory(params: {
  deviceId?: string;
  serialNumber?: string;
}) {
  const api = useApiClient();
  const key = params.deviceId ?? params.serialNumber ?? "";
  return useQuery({
    queryKey: configKeys.firmware(key),
    queryFn: ({ signal }) =>
      api.get<FirmwareHistoryItem[]>(
        `/device/firmware/history${buildQuery({ ...params })}`,
        { signal },
      ),
    enabled: Boolean(key),
  });
}

export function useDeviceLogs(identifier: string | undefined) {
  const api = useApiClient();
  return useQuery({
    queryKey: configKeys.logs(identifier ?? ""),
    queryFn: ({ signal }) =>
      api.get<DeviceLogItem[]>(`/device/log${buildQuery({ identifier })}`, {
        signal,
      }),
    enabled: Boolean(identifier),
  });
}
