import { useQuery } from "@tanstack/react-query";
import type { ApplySource } from "@/serial";
import { useApiClient } from "./client";
import type {
  LibraryConfigDetail,
  LibraryConfigSummary,
  LibraryConfigVersion,
  LibraryCreator,
  LibrarySnapshotRef,
} from "./types";

/**
 * The three published-config libraries exposed by the RRIV API. Each has the
 * same surface: `GET {base}` (list) and `GET {base}/:id` (detail + versions).
 */
export const LIBRARY_KINDS = ["sensor", "datalogger", "system"] as const;

export type LibraryKind = (typeof LIBRARY_KINDS)[number];

const LIBRARY_BASE: Record<LibraryKind, string> = {
  sensor: "/sensor/libraryConfig",
  datalogger: "/datalogger/libraryConfig",
  system: "/configSnapshot/libraryConfig",
};

export function libraryBase(kind: LibraryKind): string {
  return LIBRARY_BASE[kind];
}

/**
 * Query parameters accepted by the library list endpoints. `search`, `name`
 * and `author` all require 3–20 characters; `offset` is capped at 100 by the
 * API.
 */
export interface LibraryFilters {
  search?: string;
  name?: string;
  author?: string;
  isPublic?: boolean;
  isOfficial?: boolean;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
  orderBy?: "createdAt" | "name";
}

function buildQuery(filters: LibraryFilters): string {
  const params = new URLSearchParams();

  const setString = (key: string, value: string | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) params.set(key, trimmed);
  };

  setString("search", filters.search);
  setString("name", filters.name);
  setString("author", filters.author);
  if (filters.isPublic !== undefined) {
    params.set("isPublic", String(filters.isPublic));
  }
  if (filters.isOfficial !== undefined) {
    params.set("isOfficial", String(filters.isOfficial));
  }
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters.offset !== undefined) params.set("offset", String(filters.offset));
  if (filters.order) params.set("order", filters.order);
  if (filters.orderBy) params.set("orderBy", filters.orderBy);

  const query = params.toString();
  return query ? `?${query}` : "";
}

export const libraryKeys = {
  list: (kind: LibraryKind, filters: LibraryFilters) =>
    ["library", kind, filters] as const,
  detail: (kind: LibraryKind, id: string) =>
    ["library", kind, "detail", id] as const,
};

export function useLibraryConfigs(
  kind: LibraryKind,
  filters: LibraryFilters,
  enabled = true,
) {
  const api = useApiClient();
  return useQuery({
    queryKey: libraryKeys.list(kind, filters),
    queryFn: ({ signal }) =>
      api.get<LibraryConfigSummary[]>(
        `${libraryBase(kind)}${buildQuery(filters)}`,
        { signal },
      ),
    enabled,
  });
}

export function useLibraryConfig(kind: LibraryKind, id: string | undefined) {
  const api = useApiClient();
  return useQuery({
    queryKey: libraryKeys.detail(kind, id ?? ""),
    queryFn: ({ signal }) =>
      api.get<LibraryConfigDetail>(`${libraryBase(kind)}/${id}`, { signal }),
    enabled: Boolean(id),
  });
}

/** Display name for a creator relation, whichever spelling the API used. */
export function creatorName(
  entry: { Creator?: LibraryCreator; creator?: LibraryCreator },
  fallback = "Unknown",
): string {
  const creator = entry.Creator ?? entry.creator;
  if (!creator) return fallback;
  const name = [creator.firstName, creator.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || fallback;
}

/**
 * The by-id response nests versions under a kind-specific key
 * (`SensorLibraryConfigVersion`, `DataloggerLibraryConfigVersion`,
 * `SystemLibraryConfigVersion`). This normalises them to one list.
 */
export function libraryVersions(
  detail: LibraryConfigDetail,
): LibraryConfigVersion[] {
  return (
    detail.SensorLibraryConfigVersion ??
    detail.DataloggerLibraryConfigVersion ??
    detail.SystemLibraryConfigVersion ??
    []
  );
}

/**
 * What a library version would apply to a board. `sensorId` is the id the
 * sensor takes on the board (sensor kind only); it defaults to the saved
 * config's name, which is the id it had on the board it was saved from.
 * `null` when the version has no config payload.
 */
export function applySourceFromVersion(
  kind: LibraryKind,
  version: LibraryConfigVersion,
  sensorId?: string,
): ApplySource | null {
  if (kind === "system") {
    return version.ConfigSnapshot ? applySourceFromSnapshot(version.ConfigSnapshot) : null;
  }
  if (kind === "datalogger") {
    const config = version.DataloggerConfig;
    return config
      ? { kind: "datalogger", datalogger: config.config, dataloggerDriverId: config.dataloggerDriverId }
      : null;
  }
  const config = version.SensorConfig;
  return config
    ? {
        kind: "sensor",
        sensor: { id: sensorId ?? config.name, config: config.config, driverId: config.sensorDriverId },
      }
    : null;
}

/**
 * A whole-board config (a system library version's snapshot, or a saved
 * snapshot): the board ends up with exactly this datalogger and these sensors.
 */
export function applySourceFromSnapshot(
  snapshot: Pick<LibrarySnapshotRef, "DataloggerConfig" | "SensorConfig">,
): ApplySource {
  return {
    kind: "system",
    datalogger: snapshot.DataloggerConfig?.[0]?.config ?? null,
    dataloggerDriverId: snapshot.DataloggerConfig?.[0]?.dataloggerDriverId,
    sensors: (snapshot.SensorConfig ?? []).map((sensor) => ({
      id: sensor.name,
      config: sensor.config,
      driverId: sensor.sensorDriverId,
    })),
  };
}

/** What can be applied to a board: a library kind, or one of your saved snapshots. */
export type ApplyKind = LibraryKind | "saved";

/** What `/connect?apply=…` asks to open. Saved snapshots have no versions. */
export type ApplyRequest =
  | { kind: LibraryKind; id: string; version: number }
  | { kind: "saved"; id: string; version: null };

/** The `/connect` link that opens a library version ready to apply to a board. */
export function applyLink(kind: LibraryKind, id: string, version: number): string {
  return `/connect?${new URLSearchParams({ apply: `${kind}:${id}:${version}` })}`;
}

/** The `/connect` link that opens one of your saved snapshots ready to apply. */
export function savedApplyLink(id: string): string {
  return `/connect?${new URLSearchParams({ apply: `saved:${id}` })}`;
}

/** Parse `?apply=<kind>:<id>:<version>` or `?apply=saved:<id>`; `null` if it isn't one. */
export function parseApplyParam(value: string | null): ApplyRequest | null {
  const [kind, id, version] = value?.split(":") ?? [];
  if (!kind || !id) return null;
  if (kind === "saved") return version === undefined ? { kind, id, version: null } : null;
  const number = Number(version);
  if (!Number.isInteger(number) || number < 1) return null;
  if (!(LIBRARY_KINDS as readonly string[]).includes(kind)) return null;
  return { kind: kind as LibraryKind, id, version: number };
}
