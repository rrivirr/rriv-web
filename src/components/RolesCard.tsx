import { type FormEvent, useState } from "react";
import {
  type SystemRole,
  useGrantRole,
  useRevokeRole,
  useRoleHolders,
} from "@/api/admins";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { QueryError } from "@/components/QueryError";
import { Skeleton } from "@/components/Skeleton";

const ROLE_INFO: Record<SystemRole, { label: string; description: string }> = {
  admin: {
    label: "Admin",
    description: "Full system access, including this dashboard. Can also provision boards.",
  },
  provisioner: {
    label: "Provisioner",
    description: "Can provision new boards from the Connect page.",
  },
};

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

/** Admin-only: grant and revoke system roles (admin, provisioner). */
export function RolesCard() {
  const holders = useRoleHolders();
  const grant = useGrantRole();
  const revoke = useRevokeRole();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SystemRole>("provisioner");

  const rows = holders.data ?? [];
  const adminCount = rows.filter((row) => row.roles.includes("admin")).length;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;
    grant.mutate({ email: value, role }, { onSuccess: () => setEmail("") });
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-fg">Roles</h2>
        <p className="text-sm text-fg-muted">
          Accounts with system-wide access. {ROLE_INFO.admin.description}{" "}
          {ROLE_INFO.provisioner.label}s: {ROLE_INFO.provisioner.description.toLowerCase()}
        </p>
      </div>

      <form onSubmit={onSubmit} className="surface flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="role-email" className="mb-1.5 block text-xs font-medium text-fg-muted">
            Account email
          </label>
          <input
            id="role-email"
            type="email"
            required
            className="field"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="user@example.com"
          />
        </div>
        <div>
          <label htmlFor="role-select" className="mb-1.5 block text-xs font-medium text-fg-muted">
            Role
          </label>
          <select
            id="role-select"
            className="field"
            value={role}
            onChange={(event) => setRole(event.target.value as SystemRole)}
          >
            {(Object.keys(ROLE_INFO) as SystemRole[]).map((option) => (
              <option key={option} value={option}>
                {ROLE_INFO[option].label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={grant.isPending || !email.trim()}
        >
          {grant.isPending ? "Granting…" : "Grant role"}
        </button>
        {grant.isError ? (
          <p className="w-full text-xs text-red-500">
            {errorText(grant.error, "Could not grant the role.")}
          </p>
        ) : null}
      </form>

      {holders.isError ? (
        <QueryError error={holders.error} label="roles" />
      ) : holders.isPending ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <EmptyState title="No role holders" description="No account currently holds a system role." />
      ) : (
        <div className="surface divide-y divide-border overflow-hidden">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm text-fg">
                  {row.firstName} {row.lastName}
                </p>
                <p className="truncate text-xs text-fg-subtle">{row.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {row.roles.map((held) => {
                  const lastAdmin = held === "admin" && adminCount <= 1;
                  const label = ROLE_INFO[held].label;
                  return (
                    <span key={held} className="inline-flex items-center gap-1">
                      <Badge tone={held === "admin" ? "brand" : "neutral"}>{label}</Badge>
                      <button
                        type="button"
                        className="btn px-2 py-1 text-xs"
                        aria-label={`Remove ${label} from ${row.email}`}
                        disabled={revoke.isPending || lastAdmin}
                        title={lastAdmin ? "The last admin cannot be removed" : undefined}
                        onClick={() => revoke.mutate({ id: row.id, role: held })}
                      >
                        Remove
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {revoke.isError ? (
        <p className="text-sm text-red-500">
          {errorText(revoke.error, "Could not remove the role.")}
        </p>
      ) : null}
    </section>
  );
}
