import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./client";
import { buildQuery } from "./query";
import type { Device } from "./types";

export interface DeviceFilters {
  search?: string;
  serialNumber?: string;
  uniqueName?: string;
  /** UUID — returns just that device. */
  id?: string;
  /** Matches uniqueName, serialNumber or assignedDeviceName. */
  identifier?: string;
  contextId?: string;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
  orderBy?: "createdAt" | "uniqueName" | "serialNumber";
}

export const deviceKeys = {
  list: (filters: DeviceFilters) => ["devices", filters] as const,
};

export function useDevices(filters: DeviceFilters = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: deviceKeys.list(filters),
    queryFn: ({ signal }) =>
      api.get<Device[]>(`/device${buildQuery({ ...filters })}`, { signal }),
  });
}

/** Single device by id via `GET /device?id=`. */
export function useDevice(id: string | undefined) {
  const api = useApiClient();
  return useQuery({
    queryKey: deviceKeys.list({ id }),
    queryFn: ({ signal }) =>
      api.get<Device[]>(`/device${buildQuery({ id })}`, { signal }),
    enabled: Boolean(id),
    select: (devices) => devices[0] ?? null,
  });
}
