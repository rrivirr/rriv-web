import { QueryClient } from "@tanstack/react-query";

/**
 * Shared TanStack Query client. Defaults are conservative for an
 * authorization-gated API: no focus refetch storms, short-lived cache.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
