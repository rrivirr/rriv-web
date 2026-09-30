import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { useDevices } from "@/api/devices";
import {
  useCreateDeviceContext,
  useDeleteContext,
  useShareContext,
  useContextRecipients,
  useUpdateContext,
} from "@/api/mutations";
import type { Context } from "@/api/types";
import { Badge } from "@/components/Badge";
import { SectionCard } from "@/components/SectionCard";
import { Skeleton } from "@/components/Skeleton";
import { Spinner } from "@/components/Spinner";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

/** Rename / end / delete — owner only, no board involvement. */
export function ContextHeaderActions({
  context,
  owned,
}: {
  context: Context;
  owned: boolean;
}) {
  const navigate = useNavigate();
  const update = useUpdateContext();
  const remove = useDeleteContext();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(context.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!owned) return null;

  function onRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = name.trim();
    if (value.length < 3 || value.length > 20 || value === context.name) return;
    update.mutate(
      { id: context.id, body: { name: value } },
      { onSuccess: () => setRenaming(false) },
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {renaming ? (
        <form className="flex items-center gap-2" onSubmit={onRename}>
          <input
            className="field w-44"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Context name"
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={update.isPending}
          >
            Save
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setRenaming(false);
              setName(context.name);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setRenaming(true)}
        >
          Rename
        </button>
      )}

      {!context.endedAt ? (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={update.isPending}
          onClick={() => update.mutate({ id: context.id, body: { end: true } })}
        >
          End context
        </button>
      ) : null}

      {confirmDelete ? (
        <span className="flex items-center gap-2 text-xs text-fg-muted">
          Delete this context?
          <button
            type="button"
            className="btn btn-ghost"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(context.id, {
                onSuccess: () => navigate("/contexts"),
              })
            }
          >
            {remove.isPending ? <Spinner /> : "Confirm"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setConfirmDelete(false)}
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="btn btn-ghost text-red-500"
          onClick={() => setConfirmDelete(true)}
        >
          Delete
        </button>
      )}

      {update.isError ? (
        <p className="w-full text-xs text-red-500">
          {errorText(update.error)}
        </p>
      ) : null}
      {remove.isError ? (
        <p className="w-full text-xs text-red-500">
          {errorText(remove.error)}
        </p>
      ) : null}
    </div>
  );
}

/** Owner-only sharing: recipients + share by email. */
export function ContextSharing({
  contextId,
  owned,
}: {
  contextId: string;
  owned: boolean;
}) {
  const recipients = useContextRecipients(owned ? contextId : undefined);
  const share = useShareContext();
  const [email, setEmail] = useState("");

  if (!owned) return null;

  function onShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;
    share.mutate(
      { id: contextId, email: value },
      { onSuccess: () => setEmail("") },
    );
  }

  const list = recipients.data ?? [];

  return (
    <SectionCard
      title="Sharing"
      subtitle="Editors can access every device in this context"
      action={<Badge tone="neutral">{list.length}</Badge>}
    >
      {recipients.isPending ? (
        <Skeleton className="h-10 rounded-xl" />
      ) : list.length === 0 ? (
        <p className="text-sm text-fg-subtle">Not shared with anyone yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((account) => (
            <li key={account.id} className="py-2 text-sm text-fg">
              {account.email}
            </li>
          ))}
        </ul>
      )}

      <form className="mt-4 flex gap-2" onSubmit={onShare}>
        <input
          type="email"
          className="field"
          placeholder="name@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-label="Recipient email"
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={share.isPending || email.trim().length === 0}
        >
          {share.isPending ? <Spinner /> : "Share"}
        </button>
      </form>
      {share.isError ? (
        <p className="mt-2 text-xs text-red-500">{errorText(share.error)}</p>
      ) : null}
      <p className="mt-2 text-xs text-fg-subtle">
        Sharing is applied asynchronously and there is no revoke endpoint yet.
      </p>
    </SectionCard>
  );
}

/** Add an unassigned, writable device to this context. */
export function AddDeviceToContext({ contextId }: { contextId: string }) {
  const devices = useDevices({});
  const create = useCreateDeviceContext();
  const [deviceId, setDeviceId] = useState("");
  const [assigned, setAssigned] = useState("");

  const candidates = (devices.data ?? []).filter(
    (device) => !device.DeviceContext || device.DeviceContext.length === 0,
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const assignedName = assigned.trim();
    if (!deviceId || assignedName.length < 3) return;
    create.mutate(
      { contextId, deviceId, assignedDeviceName: assignedName },
      {
        onSuccess: () => {
          setDeviceId("");
          setAssigned("");
        },
      },
    );
  }

  if (devices.isPending) return <Skeleton className="h-10 rounded-xl" />;

  if (candidates.length === 0) {
    return (
      <p className="text-xs text-fg-subtle">
        No unassigned devices available. Bind a device first (a device can be in
        one active context at a time).
      </p>
    );
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
      onSubmit={onSubmit}
    >
      <select
        className="field"
        value={deviceId}
        onChange={(event) => setDeviceId(event.target.value)}
        aria-label="Device"
      >
        <option value="">Select a device…</option>
        {candidates.map((device) => (
          <option key={device.id} value={device.id}>
            {device.uniqueName} ({device.serialNumber})
          </option>
        ))}
      </select>
      <input
        className="field"
        placeholder="Assigned name (3–40)"
        value={assigned}
        onChange={(event) => setAssigned(event.target.value)}
        aria-label="Assigned name"
      />
      <button
        type="submit"
        className="btn btn-primary"
        disabled={create.isPending || !deviceId || assigned.trim().length < 3}
      >
        {create.isPending ? <Spinner /> : "Add device"}
      </button>
      {create.isError ? (
        <p className="text-xs text-red-500 sm:col-span-3">
          {errorText(create.error)}
        </p>
      ) : null}
    </form>
  );
}
