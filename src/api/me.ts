import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./client";

/** `GET /account/me` — the signed-in account plus its role flags. */
export interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  /** Can provision new boards (admins are implied). */
  isProvisioner: boolean;
}

export function useMe() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["me"],
    queryFn: ({ signal }) => api.get<Me>("/account/me", { signal }),
    staleTime: 5 * 60 * 1000,
  });
}
