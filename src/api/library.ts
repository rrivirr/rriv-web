import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./client";
import type {
  LibraryConfigDetail,
  LibraryConfigSummary,
  LibraryConfigVersion,
  LibraryCreator,
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
