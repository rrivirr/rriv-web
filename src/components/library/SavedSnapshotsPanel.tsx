import { useState } from "react";
import { Link } from "react-router";
import { savedApplyLink } from "@/api/library";
import { useDeleteSavedSnapshot, useRenameSavedSnapshot } from "@/api/libraryManage";
import { type SavedSnapshot, useSavedSnapshots } from "@/api/savedSnapshots";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { formatRelative } from "@/lib/format";
import { nameProblem } from "@/lib/validation";
import { PublishPanel } from "./PublishPanel";

/** Your saved snapshots: apply one to a board, publish it, rename or delete it. */
export function SavedSnapshotsPanel() {
  const list = useSavedSnapshots();

  if (list.isError) {
    return (
      <div className="surface border-red-500/30 p-4 text-sm text-red-600 dark:text-red-300">
        Could not load your saved configs: {list.error.message}
      </div>
    );
  }
  if (list.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    );
  }
  if (!list.data.length) {
    return (
      <EmptyState
        title="No saved configs yet"
        description="Save a device's config from its page (Snapshots), then apply it to a board or publish it here."
      />
    );
  }
  return (
    <ul className="space-y-3" aria-label="Saved configs">
      {list.data.map((snapshot) => (
        <SavedSnapshotRow key={snapshot.id} snapshot={snapshot} />
      ))}
    </ul>
  );
}

function SavedSnapshotRow({ snapshot }: { snapshot: SavedSnapshot }) {
  const [mode, setMode] = useState<"view" | "rename" | "publish" | "delete">("view");
  const [name, setName] = useState(snapshot.name);
  const rename = useRenameSavedSnapshot();
  const remove = useDeleteSavedSnapshot();
  const sensors = snapshot.SensorConfig.length;
  const renameProblem = nameProblem(name, "Name");

  return (
    <li className="surface space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-fg">{snapshot.name}</p>
          <p className="text-xs text-fg-subtle">
            Datalogger and {sensors} sensor{sensors === 1 ? "" : "s"}
            {snapshot.createdAt ? ` · saved ${formatRelative(snapshot.createdAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link to={savedApplyLink(snapshot.id)} className="btn btn-ghost">
            Apply to a board
          </Link>
          <button type="button" className="btn btn-ghost" onClick={() => setMode("publish")}>
            Publish
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setMode("rename")}>
            Rename
          </button>
          <button type="button" className="btn btn-ghost text-red-500" onClick={() => setMode("delete")}>
            Delete
          </button>
        </div>
      </div>

      {mode === "rename" ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            rename.mutate(
              { id: snapshot.id, name: name.trim() },
              { onSuccess: () => setMode("view") },
            );
          }}
        >
          <input
            className="field sm:w-44"
            aria-label={`New name for ${snapshot.name}`}
            value={name}
            maxLength={20}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={rename.isPending || renameProblem !== null}>
            Save name
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setMode("view")}>
            Cancel
          </button>
          {renameProblem && name.trim() ? <p className="w-full text-xs text-amber-600">{renameProblem}</p> : null}
          {rename.isError ? <p className="w-full text-xs text-red-500">{rename.error.message}</p> : null}
        </form>
      ) : null}

      {mode === "delete" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Delete {snapshot.name}? Boards already set from it aren't affected.</span>
          <button
            type="button"
            className="btn btn-ghost text-red-500"
            disabled={remove.isPending}
            onClick={() => remove.mutate(snapshot.id)}
          >
            Delete
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setMode("view")}>
            Cancel
          </button>
          {remove.isError ? <p className="w-full text-xs text-red-500">{remove.error.message}</p> : null}
        </div>
      ) : null}

      {mode === "publish" ? (
        <PublishPanel
          wholeDeviceOnly
          content={{
            datalogger: snapshot.DataloggerConfig[0]?.config ?? null,
            dataloggerDriverId: snapshot.DataloggerConfig[0]?.dataloggerDriverId ?? null,
            sensors: snapshot.SensorConfig.map((sensor) => ({
              name: sensor.name,
              config: sensor.config,
              driverId: sensor.sensorDriverId ?? null,
            })),
          }}
          onClose={() => setMode("view")}
        />
      ) : null}
    </li>
  );
}
