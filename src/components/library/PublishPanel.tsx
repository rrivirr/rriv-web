import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import { type LibraryKind, useLibraryConfigs } from "@/api/library";
import {
  type PublishContent,
  type PublishScope,
  publishBody,
  useCreateLibraryConfig,
  usePublishLibraryVersion,
  useUpdateLibraryConfig,
} from "@/api/libraryManage";
import { Spinner } from "@/components/Spinner";
import { nameProblem } from "@/lib/validation";

const SCOPE_LABELS: Record<LibraryKind, string> = {
  system: "Whole device (datalogger and sensors)",
  datalogger: "Datalogger settings only",
  sensor: "One sensor",
};

/** Your own configs of a kind, to publish a new version of. */
const MINE = { limit: 100, orderBy: "name", order: "asc" } as const;

type Done = { kind: LibraryKind; id: string; name: string; version: boolean };

/**
 * Publish a device's config (or a saved snapshot) to the library: the whole
 * device, the datalogger, or one sensor, as a new library config or as the
 * next version of one of yours.
 */
export function PublishPanel({
  content,
  firmwareVersion,
  wholeDeviceOnly = false,
  onClose,
}: {
  content: PublishContent;
  /** Recorded on the version so applying it to other firmware warns. */
  firmwareVersion?: string | null;
  /** Saved snapshots publish as a whole device. */
  wholeDeviceOnly?: boolean;
  onClose?: () => void;
}) {
  const [kind, setKind] = useState<LibraryKind>("system");
  const [sensorName, setSensorName] = useState(content.sensors[0]?.name ?? "");
  const [target, setTarget] = useState<"new" | "version">("new");
  const [existingId, setExistingId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [makePublic, setMakePublic] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  const create = useCreateLibraryConfig();
  const publishVersion = usePublishLibraryVersion();
  const update = useUpdateLibraryConfig();
  const mine = useLibraryConfigs(kind, MINE, target === "version");
  const busy = create.isPending || publishVersion.isPending || update.isPending;
  const error = create.error ?? publishVersion.error ?? update.error;

  const scope: PublishScope = useMemo(
    () => (kind === "sensor" ? { kind, sensorName } : { kind }),
    [kind, sensorName],
  );
  const extras = {
    name: name.trim(),
    description: description.trim() || undefined,
    firmwareVersion,
  };
  const body = publishBody(scope, content, extras, target === "version");
  const problems = [
    target === "new" ? nameProblem(name, "Name") : null,
    nameProblem(description, target === "new" ? "Description" : "Version note", true),
  ].filter((problem): problem is string => problem !== null);
  const nameOk = (target === "version" ? Boolean(existingId) : true) && problems.length === 0;
  const kinds: LibraryKind[] = wholeDeviceOnly ? ["system"] : ["system", "datalogger", "sensor"];

  const reset = () => {
    create.reset();
    publishVersion.reset();
    update.reset();
    setDone(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!body || !nameOk) return;
    reset();
    if (target === "version") {
      await publishVersion.mutateAsync({ kind, id: existingId, body });
      const existing = mine.data?.find((entry) => entry.id === existingId);
      setDone({ kind, id: existingId, name: existing?.name ?? "", version: true });
      return;
    }
    const created = await create.mutateAsync({ kind, body });
    if (makePublic) {
      await update.mutateAsync({ kind, id: created.id, changes: { isPublic: true } });
    }
    setDone({ kind, id: created.id, name: created.name, version: false });
  };

  if (done) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-emerald-600 dark:text-emerald-300">
          {done.version ? `Published a new version of ${done.name}.` : `Published ${done.name} to the library.`}
        </p>
        <div className="flex gap-3">
          <Link to={`/library/${done.kind}/${done.id}`} className="text-accent hover:underline">
            View in library
          </Link>
          <button type="button" className="text-fg-muted hover:text-fg" onClick={reset}>
            Publish something else
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={(event) => void submit(event).catch(() => undefined)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-fg-muted">
          What to publish
          <select
            className="field mt-1"
            value={kind}
            disabled={wholeDeviceOnly}
            onChange={(event) => {
              setKind(event.target.value as LibraryKind);
              setExistingId("");
            }}
          >
            {kinds.map((option) => (
              <option key={option} value={option}>
                {SCOPE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        {kind === "sensor" ? (
          <label className="block text-xs text-fg-muted">
            Sensor
            <select className="field mt-1" value={sensorName} onChange={(event) => setSensorName(event.target.value)}>
              {content.sensors.map((sensor) => (
                <option key={sensor.name} value={sensor.name}>
                  {sensor.name}
                  {typeof sensor.config.type === "string" ? ` (${sensor.config.type})` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <fieldset className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={target === "new"} onChange={() => setTarget("new")} />
          New library config
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={target === "version"} onChange={() => setTarget("version")} />
          New version of one of mine
        </label>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        {target === "new" ? (
          <label className="block text-xs text-fg-muted">
            Name
            <input className="field mt-1" value={name} maxLength={20} onChange={(event) => setName(event.target.value)} />
          </label>
        ) : (
          <label className="block text-xs text-fg-muted">
            Library config
            <select
              className="field mt-1"
              value={existingId}
              disabled={mine.isPending}
              onChange={(event) => setExistingId(event.target.value)}
            >
              <option value="">
                {mine.isPending ? "Loading…" : mine.data?.length ? "Choose one of yours" : "You have none of this kind yet"}
              </option>
              {mine.data?.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-xs text-fg-muted">
          {target === "new" ? "Description (optional)" : "Version note (optional)"}
          <input
            className="field mt-1"
            value={description}
            maxLength={20}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
      </div>

      {target === "new" ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={makePublic} onChange={(event) => setMakePublic(event.target.checked)} />
          Make it public
        </label>
      ) : null}

      <p className="text-xs text-fg-subtle">
        {firmwareVersion
          ? `Recorded as made with firmware ${firmwareVersion}.`
          : "No firmware version is recorded, so applying it won't warn about firmware differences."}
      </p>
      {!body ? <p className="text-xs text-amber-600">There's nothing of this kind to publish.</p> : null}
      {/* Only once something is typed: an empty required name just disables Publish. */}
      {problems
        .filter((problem) => !problem.endsWith("is required."))
        .map((problem) => (
          <p key={problem} className="text-xs text-amber-600">
            {problem}
          </p>
        ))}
      {error ? <p className="text-xs text-red-500">{error.message}</p> : null}

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy || !body || !nameOk}>
          {busy ? <Spinner /> : "Publish"}
        </button>
        {onClose ? (
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
