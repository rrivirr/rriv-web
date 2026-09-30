import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./client";

/** An account holding `admin` on `system:rriv`. */
export interface AdminAccount {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export const adminKeys = {
  list: ["admins"] as const,
};

export function useAdmins() {
  const api = useApiClient();
  return useQuery({
    queryKey: adminKeys.list,
    queryFn: ({ signal }) =>
      api.get<AdminAccount[]>("/admin/admins", { signal }),
  });
}

export function useGrantAdmin() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      api.post<AdminAccount>("/admin/admins", { email }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.list }),
  });
}

export function useRevokeAdmin() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/admin/admins/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.list }),
  });
}
