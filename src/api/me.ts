import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./client";

/** `GET /account/me` — the signed-in account plus its admin flag. */
export interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
}

export function useMe() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["me"],
    queryFn: ({ signal }) => api.get<Me>("/account/me", { signal }),
    staleTime: 5 * 60 * 1000,
  });
}
