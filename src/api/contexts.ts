import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./client";
import { buildQuery } from "./query";
import type { Context } from "./types";

export interface ContextFilters {
  search?: string;
  name?: string;
  /** `true` returns ended contexts, `false` returns active ones. */
  ended?: boolean;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
  orderBy?: "startedAt" | "endedAt" | "name";
}

export const contextKeys = {
  list: (filters: ContextFilters) => ["contexts", filters] as const,
};

/**
 * Contexts the caller can edit: their own plus any shared with them.
 * There is no `GET /context/:id`, so detail views filter this list.
 */
export function useContexts(filters: ContextFilters = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: contextKeys.list(filters),
    queryFn: ({ signal }) =>
      api.get<Context[]>(`/context${buildQuery({ ...filters })}`, { signal }),
  });
}
