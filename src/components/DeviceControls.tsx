import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import {
  useCreateDeviceLog,
  useDeleteDevice,
  useSaveSnapshot,
  useSendCommand,
  useUnbindDevice,
} from "@/api/mutations";
import type { Device } from "@/api/types";
import { Spinner } from "@/components/Spinner";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

/** Send a downlink command to the device (ChirpStack; no board needed). */
export function DeviceCommandForm({ identifier }: { identifier: string }) {
  const send = useSendCommand();
  const [command, setCommand] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    send.mutate(
      { identifier, command: value },
      { onSuccess: () => setCommand("") },
    );
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div>
        <label
          htmlFor="command"
          className="mb-1.5 block text-xs font-medium text-fg-muted"
        >
          Command
        </label>
        <div className="flex gap-2">
          <input
            id="command"
            className="field"
            placeholder="e.g. reboot"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={send.isPending || command.trim().length === 0}
          >
            {send.isPending ? <Spinner /> : "Send"}
          </button>
        </div>
      </div>
      {send.isSuccess ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-300">
          Command queued
          {send.data?.responseId ? ` (${send.data.responseId})` : ""}.
        </p>
      ) : null}
      {send.isError ? (
        <p className="text-xs text-red-500">{errorText(send.error)}</p>
      ) : null}
    </form>
  );
}

/** Add a manual log against the device. */
export function AddDeviceLogForm({ identifier }: { identifier: string }) {
  const createLog = useCreateDeviceLog();
  const [log, setLog] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = log.trim();
    if (!value) return;
    createLog.mutate(
      { identifier, log: value },
      { onSuccess: () => setLog("") },
    );
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div>
        <label
          htmlFor="device-log"
          className="mb-1.5 block text-xs font-medium text-fg-muted"
        >
          Log entry
        </label>
        <textarea
          id="device-log"
          className="field min-h-20"
          maxLength={100}
          placeholder="Note about this device (max 100 chars)"
          value={log}
          onChange={(event) => setLog(event.target.value)}
        />
      </div>
      {createLog.isError ? (
        <p className="text-xs text-red-500">{errorText(createLog.error)}</p>
      ) : null}
      <button
        type="submit"
        className="btn btn-ghost"
        disabled={createLog.isPending || log.trim().length === 0}
      >
        {createLog.isPending ? <Spinner /> : "Add log"}
      </button>
    </form>
  );
}

/** Bookmark the device's current cloud config as a named snapshot. */
export function SaveSnapshotForm({
  deviceId,
  contextId,
}: {
  deviceId: string;
  contextId: string;
}) {
  const save = useSaveSnapshot();
  const [name, setName] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = name.trim();
    if (value.length < 3) return;
    save.mutate(
      { name: value, deviceId, contextId },
      { onSuccess: () => setName("") },
    );
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <p className="text-xs text-fg-subtle">
        Saves the current applied config as a named snapshot. This does not
        change the board.
      </p>
      <div className="flex gap-2">
        <input
          className="field"
          placeholder="Snapshot name (3–20)"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Snapshot name"
        />
        <button
          type="submit"
          className="btn btn-ghost"
          disabled={save.isPending || name.trim().length < 3}
        >
          {save.isPending ? <Spinner /> : "Save snapshot"}
        </button>
      </div>
      {save.isSuccess ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-300">Saved.</p>
      ) : null}
      {save.isError ? (
        <p className="text-xs text-red-500">{errorText(save.error)}</p>
      ) : null}
    </form>
  );
}

/** Unbind / delete. Owner-only on the API side. */
export function DeviceDangerZone({ device }: { device: Device }) {
  const navigate = useNavigate();
  const unbind = useUnbindDevice();
  const remove = useDeleteDevice();
  const [confirm, setConfirm] = useState<"unbind" | "delete" | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-subtle">
        Unbinding and deleting require ownership and detach the device from all
        contexts. These cannot be undone from the web.
      </p>

      {confirm === null ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setConfirm("unbind")}
          >
            Unbind device
          </button>
          <button
            type="button"
            className="btn btn-ghost text-red-500"
            onClick={() => setConfirm("delete")}
          >
            Delete device
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          {confirm === "unbind"
            ? "Unbind this device?"
            : "Permanently delete this device?"}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={unbind.isPending || remove.isPending}
            onClick={() => {
              if (confirm === "unbind") {
                unbind.mutate(device.serialNumber, {
                  onSuccess: () => navigate("/devices"),
                });
              } else {
                remove.mutate(device.serialNumber, {
                  onSuccess: () => navigate("/devices"),
                });
              }
            }}
          >
            {unbind.isPending || remove.isPending ? (
              <Spinner />
            ) : (
              "Confirm"
            )}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setConfirm(null)}
          >
            Cancel
          </button>
        </div>
      )}

      {unbind.isError ? (
        <p className="text-xs text-red-500">{errorText(unbind.error)}</p>
      ) : null}
      {remove.isError ? (
        <p className="text-xs text-red-500">{errorText(remove.error)}</p>
      ) : null}
    </div>
  );
}
