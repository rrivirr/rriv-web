import { type FormEvent, useState } from "react";
import { useAdmins, useGrantAdmin, useRevokeAdmin } from "@/api/admins";
import { EmptyState } from "@/components/EmptyState";
import { QueryError } from "@/components/QueryError";
import { Skeleton } from "@/components/Skeleton";

/** Admin-only: list, grant and revoke system administrators. */
export function AdminsCard() {
  const admins = useAdmins();
  const grant = useGrantAdmin();
  const revoke = useRevokeAdmin();
  const [email, setEmail] = useState("");

  const rows = admins.data ?? [];
  const lastAdmin = rows.length <= 1;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;
    grant.mutate(value, { onSuccess: () => setEmail("") });
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-fg">Admins</h2>
        <p className="text-sm text-fg-muted">
          Accounts with system-wide administrator access.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="surface flex flex-wrap items-end gap-3 p-4"
      >
        <div className="min-w-0 flex-1">
          <label
            htmlFor="new-admin-email"
            className="mb-1.5 block text-xs font-medium text-fg-muted"
          >
            Account email
          </label>
          <input
            id="new-admin-email"
            type="email"
            required
            className="field"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="user@example.com"
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={grant.isPending || !email.trim()}
        >
          {grant.isPending ? "Adding…" : "Add admin"}
        </button>
        {grant.isError ? (
          <p className="w-full text-xs text-red-500">
            {grant.error instanceof Error
              ? grant.error.message
              : "Could not add the admin."}
          </p>
        ) : null}
      </form>

      {admins.isError ? (
        <QueryError error={admins.error} label="admins" />
      ) : admins.isPending ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No admins"
          description="No account currently has administrator access."
        />
      ) : (
        <div className="surface divide-y divide-border overflow-hidden">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-fg">
                  {row.firstName} {row.lastName}
                </p>
                <p className="truncate text-xs text-fg-subtle">{row.email}</p>
              </div>
              <button
                type="button"
                className="btn shrink-0"
                disabled={revoke.isPending || lastAdmin}
                title={lastAdmin ? "The last admin cannot be removed" : undefined}
                onClick={() => revoke.mutate(row.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {revoke.isError ? (
        <p className="text-sm text-red-500">
          {revoke.error instanceof Error
            ? revoke.error.message
            : "Could not remove the admin."}
        </p>
      ) : null}
    </section>
  );
}
