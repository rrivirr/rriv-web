import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./client";

/** Roles granted on `system:rriv`. Admins are implicitly provisioners. */
export const SYSTEM_ROLES = ["admin", "provisioner"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** An account holding one or more system roles (`GET /admin/roles`). */
export interface RoleHolder {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: SystemRole[];
}

export const roleKeys = {
  list: ["admin", "roles"] as const,
};

export function useRoleHolders() {
  const api = useApiClient();
  return useQuery({
    queryKey: roleKeys.list,
    queryFn: ({ signal }) => api.get<RoleHolder[]>("/admin/roles", { signal }),
  });
}

export function useGrantRole() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; role: SystemRole }) =>
      api.post<RoleHolder>("/admin/roles", body),
    onSuccess: () => client.invalidateQueries({ queryKey: roleKeys.list }),
  });
}

export function useRevokeRole() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: SystemRole }) =>
      api.delete<void>(`/admin/roles/${role}/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: roleKeys.list }),
  });
}
