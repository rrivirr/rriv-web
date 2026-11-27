import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  type ApplyKind,
  type ApplyRequest,
  LIBRARY_KINDS,
  applySourceFromSnapshot,
  applySourceFromVersion,
  libraryVersions,
  useLibraryConfig,
  useLibraryConfigs,
} from "@/api/library";
import { useSavedSnapshot, useSavedSnapshots } from "@/api/savedSnapshots";
import { useActiveConfig } from "@/api/configs";
import type { ConfigSource } from "@/api/deviceLink";
import { SectionCard } from "@/components/SectionCard";
import {
  type ApplyPlan,
  type ApplySource,
  type ApplyStep,
  MAX_SENSOR_ID_LENGTH,
  type SerialConnection,
  type SettingChange,
  type StepResult,
  planApply,
  readBoardConfig,
  runApplyPlan,
} from "@/serial";
import { alreadyRecorded, coveredObjects } from "./applyRecord";
import type { BoardLink, SyncOutcome } from "./useBoardLink";
import { Callout, type Feedback, FeedbackCallout, button, input, label, primary, useTask } from "./ui";

const KIND_LABELS: Record<ApplyKind, string> = {
  system: "Whole board (datalogger and sensors)",
  datalogger: "Datalogger settings",
  sensor: "One sensor",
  saved: "Saved config (yours, whole board)",
};

const APPLY_KINDS: readonly ApplyKind[] = [...LIBRARY_KINDS, "saved"];

/** Up to the API's page limit; the picker lists names only. */
const PICKER_FILTERS = { limit: 100, orderBy: "name", order: "asc" } as const;

export type { ApplyRequest };

/**
 * Apply a library config to the connected board: pick a config, review what
 * would change on the board, then send it one command at a time.
 */
export function LibraryApplyTab({
  serial,
  link,
  locked,
  request,
}: {
  serial: SerialConnection;
  link: BoardLink;
  locked: boolean;
  /** From `/connect?apply=…`: the config to start with. */
  request: ApplyRequest | null;
}) {
  const [kind, setKind] = useState<ApplyKind>(request?.kind ?? "system");
  const [configId, setConfigId] = useState(request?.id ?? "");
  const [version, setVersion] = useState<number | null>(request?.version ?? null);
  const [sensorId, setSensorId] = useState<string | null>(null);
  const [plan, setPlan] = useState<ApplyPlan | null>(null);
  const [results, setResults] = useState<StepResult[] | null>(null);
  const task = useTask();
  const client = serial.client;

  const isSaved = kind === "saved";
  const libraryKind = isSaved ? "system" : kind;
  const libraryList = useLibraryConfigs(libraryKind, PICKER_FILTERS, !isSaved);
  const savedList = useSavedSnapshots(isSaved);
  const list = isSaved ? savedList : libraryList;
  const detail = useLibraryConfig(libraryKind, !isSaved && configId ? configId : undefined);
  const savedDetail = useSavedSnapshot(isSaved && configId ? configId : undefined);
  // A snapshot from a link may not be in the first page of the list.
  const snapshot = isSaved
    ? (savedList.data?.find((entry) => entry.id === configId) ?? savedDetail.data ?? null)
    : null;
  const linkedName = isSaved ? snapshot?.name : detail.data?.name;
  const versions = useMemo(
    () => (!isSaved && detail.data ? libraryVersions(detail.data) : []),
    [isSaved, detail.data],
  );
  const chosen = versions.find((entry) => entry.version === version) ?? versions[0] ?? null;
  const savedName =
    kind === "sensor" ? (chosen?.SensorConfig?.name ?? "") : "";
  const targetId = sensorId ?? savedName;
  const source = isSaved
    ? snapshot
      ? applySourceFromSnapshot(snapshot)
      : null
    : chosen
      ? applySourceFromVersion(libraryKind, chosen, targetId)
      : null;
  /**
   * Recorded on the uploaded configs, so the cloud knows where they came
   * from. A saved snapshot isn't a library version: `null` clears the source.
   */
  const origin: ConfigSource | null | undefined = isSaved
    ? null
    : chosen?.id
      ? { kind: libraryKind, versionId: chosen.id }
      : undefined;
  const firmwareMismatch =
    chosen?.firmwareVersion && serial.boardVersion && chosen.firmwareVersion !== serial.boardVersion
      ? { saved: chosen.firmwareVersion, board: serial.boardVersion }
      : null;

  const queryClient = useQueryClient();
  const covered = source ? coveredObjects(source) : null;
  // What the cloud records for this board, to tell "matches" from "already applied".
  const activeConfig = useActiveConfig(
    link.device?.id,
    link.placement?.Context.id,
    plan !== null && plan.steps.length === 0,
  );
  const recorded =
    covered && origin !== undefined && activeConfig.data
      ? alreadyRecorded(activeConfig.data, covered, origin)
      : null;
  const appliedLabel = isSaved ? "This saved config" : chosen ? `v${chosen.version}` : "This version";

  // Any change to what's picked makes the reviewed plan stale.
  useEffect(() => {
    setPlan(null);
    setResults(null);
    task.setFeedback(null);
    // task.setFeedback is a stable state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, configId, chosen?.version, targetId, snapshot?.id]);

  const disabled = locked || !client || task.busy !== null;
  const running = task.busy === "apply";
  const finished = results !== null && !running;
  const failedAt = results?.findIndex((result) => result.status === "failed") ?? -1;

  const review = () =>
    void task.run("review", async () => {
      if (!source) return { tone: "danger", message: "There's no config to apply." };
      setResults(null);
      setPlan(planApply(await readBoardConfig(client!), source));
    });

  const apply = (start = 0) =>
    void task.run("apply", async () => {
      if (!plan) return;
      const next = await runApplyPlan(client!, plan.steps, {
        start,
        previous: results ?? undefined,
        onProgress: setResults,
      });
      setResults(next);
      return syncApplied(plan.steps, next, origin);
    });

  /**
   * Upload what the board reports for the given objects, recorded as coming
   * from `from`, and end the removed sensors in the cloud.
   */
  const uploadCovered = async (
    objects: { datalogger: boolean; sensorIds: string[]; removed: string[] },
    from: ConfigSource | null | undefined,
  ): Promise<SyncOutcome[]> => {
    const board = await readBoardConfig(client!);
    const outcomes: SyncOutcome[] = [];
    // Recorded with the drivers the applied config was saved with.
    const drivers = driversOf(source);
    for (const id of objects.removed) outcomes.push(await link.syncSensorRemoval(id));
    if (objects.datalogger && board.datalogger) {
      outcomes.push(await link.syncDatalogger(board.datalogger, undefined, from, drivers.datalogger));
      void serial.refreshDatalogger().catch(() => undefined);
    }
    for (const id of objects.sensorIds) {
      const reported = board.sensors.find((sensor) => String(sensor.id).toLowerCase() === id.toLowerCase());
      if (reported) {
        outcomes.push(await link.syncSensor(reported, undefined, from, drivers.sensors.get(id.toLowerCase())));
      }
    }
    void queryClient.invalidateQueries({ queryKey: ["config", "active"] });
    return outcomes;
  };

  /** The board already matches: record that it's on this version (nothing is sent to the board). */
  const recordApplied = () =>
    void task.run("record", async () => {
      if (!covered || origin === undefined) return;
      const outcomes = await uploadCovered({ ...covered, removed: [] }, origin);
      const failure = outcomes.find((outcome) => outcome.kind === "failed");
      if (failure?.kind === "failed") {
        return { tone: "danger", message: `Couldn't record it in the cloud: ${failure.error}` };
      }
      const skipped = outcomes.find((outcome) => outcome.kind === "skipped");
      if (skipped?.kind === "skipped") return { tone: "warning", message: skipped.reason };
      return { tone: "success", message: `Recorded: the board is on ${appliedLabel}.` };
    });

  /**
   * Upload what the board now reports after an apply (see `recordAll`). The
   * board is the source of truth, so this runs after a partial apply too.
   */
  const syncApplied = async (
    steps: ApplyStep[],
    done: StepResult[],
    from: ConfigSource | null | undefined,
  ): Promise<Feedback> => {
    const succeeded = steps.filter((_, index) => done[index]?.status === "done");
    const changed = succeeded.filter((step) => step.kind !== "sensor-remove");
    // Removed and not added back (a type change re-adds under the same id).
    const removed = succeeded
      .filter((step) => step.kind === "sensor-remove")
      .map((step) => step.id)
      .filter((id) => !changed.some((step) => step.kind === "sensor-add" && step.id === id));
    const failed = done.some((result) => result.status === "failed");
    const ignored = done.some(
      (result) => result.status === "done" && result.unapplied.length > 0,
    );
    const summary = failed
      ? "The apply stopped part-way. The steps marked done are on the board."
      : ignored
        ? "Applied, but the board's replies don't reflect every setting (see the steps below)."
        : "Applied to the board.";
    const tone = failed ? "danger" : ignored ? "warning" : "success";
    // A complete apply records every object the config covers (matching ones
    // too), so the cloud says the whole board is on this version; rriv-api
    // writes nothing for an object already recorded so. A partial apply
    // records only what reached the board.
    const recordAll = !failed && from !== undefined && covered !== null;
    const datalogger = recordAll
      ? covered.datalogger
      : changed.some((step) => step.kind === "datalogger-set");
    const sensorIds = recordAll
      ? covered.sensorIds
      : changed
          .filter((step) => step.kind === "sensor-add" || step.kind === "sensor-set")
          .map((step) => step.id);
    if (!datalogger && !sensorIds.length && !removed.length) return { tone, message: summary };

    const sync = async (): Promise<SyncOutcome> => {
      const outcomes = await uploadCovered({ datalogger, sensorIds, removed }, from);
      return (
        outcomes.find((outcome) => outcome.kind === "failed") ??
        outcomes.find((outcome) => outcome.kind === "skipped") ?? { kind: "synced" }
      );
    };

    const report = (outcome: SyncOutcome): Feedback => {
      if (outcome.kind === "synced") {
        return { tone, message: `${summary} The board's new config is synced to the cloud.` };
      }
      if (outcome.kind === "skipped") return { tone, message: `${summary} ${outcome.reason}` };
      return {
        tone: "warning",
        message: `${summary} The cloud sync failed: ${outcome.error}`,
        action: (
          <button
            type="button"
            className={button}
            onClick={() =>
              void task.run("sync", async () => report(await sync().catch(errorOutcome)))
            }
          >
            Retry sync
          </button>
        ),
      };
    };

    return report(await sync().catch(errorOutcome));
  };

  return (
    <div className="space-y-5">
      <SectionCard
        title="Apply a library config"
        subtitle="Make this board match a saved config. You review every change before anything is sent."
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Config type</span>
              <select
                className={`${input} mt-1`}
                value={kind}
                disabled={running}
                onChange={(event) => {
                  setKind(event.target.value as ApplyKind);
                  setConfigId("");
                  setVersion(null);
                  setSensorId(null);
                }}
              >
                {APPLY_KINDS.map((option) => (
                  <option key={option} value={option}>
                    {KIND_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>{isSaved ? "Saved config" : "Library config"}</span>
              <select
                className={`${input} mt-1`}
                value={configId}
                disabled={running || list.isPending}
                onChange={(event) => {
                  setConfigId(event.target.value);
                  setVersion(null);
                  setSensorId(null);
                }}
              >
                <option value="">
                  {list.isPending ? "Loading…" : isSaved && !list.data?.length ? "No saved configs yet" : "Choose a config"}
                </option>
                {/* A config from a link may not be in the first page of the list. */}
                {configId && linkedName && !list.data?.some((entry) => entry.id === configId) ? (
                  <option value={configId}>{linkedName}</option>
                ) : null}
                {list.data?.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                    {"isPublic" in entry && entry.isPublic ? " (public)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {versions.length ? (
              <label className="block">
                <span className={label}>Version</span>
                <select
                  className={`${input} mt-1`}
                  value={chosen?.version ?? ""}
                  disabled={running}
                  onChange={(event) => setVersion(Number(event.target.value))}
                >
                  {versions.map((entry, index) => (
                    <option key={entry.version} value={entry.version}>
                      v{entry.version}
                      {index === 0 ? " (latest)" : ""}
                      {entry.description ? `: ${entry.description}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {kind === "sensor" && chosen ? (
              <label className="block">
                <span className={label}>Sensor id on this board</span>
                <input
                  className={`${input} mt-1 font-mono`}
                  value={targetId}
                  maxLength={MAX_SENSOR_ID_LENGTH}
                  disabled={running}
                  onChange={(event) => setSensorId(event.target.value)}
                />
                <span className="mt-1 block text-xs text-fg-subtle">
                  A sensor with this id is updated; otherwise one is added.
                </span>
              </label>
            ) : null}
          </div>

          {list.isError ? (
            <Callout tone="danger">
              Could not load {isSaved ? "your saved configs" : "the library"}: {list.error.message}
            </Callout>
          ) : null}
          {detail.isError ? (
            <Callout tone="danger">Could not load this config: {detail.error.message}</Callout>
          ) : null}
          {isSaved && configId && savedDetail.data === null && !snapshot ? (
            <Callout tone="danger">This saved config isn't available. It may belong to someone else.</Callout>
          ) : null}
          {isSaved && snapshot ? (
            <p className="text-xs text-fg-subtle">
              A copy of a board's cloud config ({snapshot.SensorConfig.length} sensor
              {snapshot.SensorConfig.length === 1 ? "" : "s"}). Applying it isn't recorded as coming
              from the library.
            </p>
          ) : null}
          {request && version !== null && versions.length && !versions.some((entry) => entry.version === version) ? (
            <Callout tone="warning">
              Version {version} isn't available; showing v{chosen?.version} instead.
            </Callout>
          ) : null}
          {chosen && !source ? (
            <Callout tone="warning">This version has no config payload to apply.</Callout>
          ) : null}
          {firmwareMismatch ? (
            <Callout tone="warning">
              Saved with firmware {firmwareMismatch.saved}; this board runs {firmwareMismatch.board}.
              Settings may differ between firmware versions, so review the changes carefully.
            </Callout>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={primary} disabled={disabled || !source} onClick={review}>
              {task.busy === "review" ? "Reading the board…" : plan ? "Review again" : "Review changes"}
            </button>
            {configId && !isSaved ? (
              <Link to={`/library/${kind}/${configId}`} className="text-xs text-accent hover:underline">
                View in library
              </Link>
            ) : null}
          </div>
          {!plan || task.busy === "review" ? <FeedbackCallout feedback={task.feedback} /> : null}
        </div>
      </SectionCard>

      {plan && task.busy !== "review" ? (
        <SectionCard
          title="Changes to the board"
          subtitle={
            kind === "system" || isSaved
              ? "The board will match this config exactly. Sensors that aren't in it are removed."
              : "Only what this config covers changes; everything else on the board stays as it is."
          }
        >
          <div className="space-y-4">
            {plan.problems.length ? (
              <Callout tone="danger">
                <p>This config can't be applied as it stands:</p>
                <ul className="mt-1 list-disc pl-5">
                  {plan.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </Callout>
            ) : null}

            {plan.steps.length ? (
              <ol className="space-y-3" aria-label="Planned changes">
                {plan.steps.map((step, index) => (
                  <StepItem
                    key={index}
                    step={step}
                    result={results?.[index] ?? null}
                    running={running}
                  />
                ))}
              </ol>
            ) : (
              <AlreadyMatches
                appliedLabel={appliedLabel}
                recorded={recorded}
                canRecord={origin !== undefined && covered !== null && Boolean(link.placement)}
                checking={activeConfig.isPending}
                busy={task.busy === "record"}
                onRecord={recordApplied}
                feedback={task.busy === "record" ? null : task.feedback}
              />
            )}

            {plan.skipped.length ? (
              <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-xs text-fg-muted">
                <p className="font-medium text-fg">Not sent</p>
                <ul className="mt-1 space-y-1">
                  {plan.skipped.map((entry) => (
                    <li key={`${entry.object}.${entry.key}`}>
                      <span className="font-mono">{entry.key}</span>: {entry.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {finished || task.busy === "sync" ? <FeedbackCallout feedback={task.feedback} /> : null}

            <div className="flex flex-wrap gap-2">
              {!finished && plan.steps.length ? (
                <button
                  type="button"
                  className={primary}
                  disabled={disabled || plan.problems.length > 0}
                  onClick={() => apply()}
                >
                  {running
                    ? "Applying…"
                    : `Apply ${plan.steps.length} change${plan.steps.length === 1 ? "" : "s"}`}
                </button>
              ) : null}
              {finished && failedAt >= 0 ? (
                <button type="button" className={primary} disabled={disabled} onClick={() => apply(failedAt)}>
                  Retry the rest
                </button>
              ) : null}
              {!running ? (
                <button
                  type="button"
                  className={button}
                  disabled={task.busy !== null}
                  onClick={() => {
                    setPlan(null);
                    setResults(null);
                    task.setFeedback(null);
                  }}
                >
                  {finished ? "Done" : "Cancel"}
                </button>
              ) : null}
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

const errorOutcome = (cause: unknown): SyncOutcome => ({
  kind: "failed",
  error: cause instanceof Error ? cause.message : String(cause),
});

const show = (value: unknown) => (value === undefined ? "not set" : JSON.stringify(value));

function stepTitle(step: ApplyStep): string {
  switch (step.kind) {
    case "sensor-remove":
      return step.reason === "type-changed"
        ? `Remove sensor ${step.id} (${step.type || "unknown type"}); it's added back with a new type`
        : `Remove sensor ${step.id} (${step.type || "unknown type"}); it isn't in this config`;
    case "datalogger-set":
      return `Datalogger: change ${step.changes.length} setting${step.changes.length === 1 ? "" : "s"}`;
    case "sensor-add":
      return `Add sensor ${step.id} (${step.type})`;
    case "sensor-set":
      return `Sensor ${step.id}: change ${step.changes.length} setting${step.changes.length === 1 ? "" : "s"}`;
  }
}

function StepItem({
  step,
  result,
  running,
}: {
  step: ApplyStep;
  result: StepResult | null;
  running: boolean;
}) {
  const changes: SettingChange[] =
    step.kind === "datalogger-set" || step.kind === "sensor-set"
      ? step.changes
      : step.kind === "sensor-add"
        ? Object.entries(step.requested).map(([key, to]) => ({ key, from: undefined, to }))
        : [];
  const removal = step.kind === "sensor-remove";

  return (
    <li
      className={[
        "rounded-lg border px-3 py-2",
        removal ? "border-red-500/30 bg-red-500/5" : "border-border bg-surface-2/30",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-fg">{stepTitle(step)}</span>
        <StepStatus result={result} running={running} />
      </div>
      {changes.length ? (
        <table className="mt-2 w-full text-left font-mono text-xs">
          <thead className="text-fg-subtle">
            <tr>
              <th className="py-1 pr-4 font-normal">setting</th>
              {step.kind === "sensor-add" ? null : <th className="py-1 pr-4 font-normal">on the board</th>}
              <th className="py-1 font-normal">new value</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((change) => (
              <tr key={change.key} className="border-t border-border">
                <td className="py-1 pr-4 text-fg">{change.key}</td>
                {step.kind === "sensor-add" ? null : (
                  <td className="py-1 pr-4 text-fg-muted">{show(change.from)}</td>
                )}
                <td className="py-1 text-fg">{show(change.to)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {result?.status === "failed" ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-300">{result.error}</p>
      ) : null}
      {result?.status === "done" && result.unapplied.length ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          The board's reply doesn't reflect:{" "}
          {result.unapplied
            .map((change) => `${change.key} is ${show(change.kept)} (sent ${show(change.requested)})`)
            .join("; ")}
        </p>
      ) : null}
    </li>
  );
}

function StepStatus({ result, running }: { result: StepResult | null; running: boolean }) {
  if (!result) return null;
  if (result.status === "done") {
    return (
      <span className="text-xs text-emerald-700 dark:text-emerald-300">
        {result.unapplied.length ? "Sent, not fully applied" : "Done"}
      </span>
    );
  }
  if (result.status === "failed") return <span className="text-xs text-red-600 dark:text-red-300">Failed</span>;
  return <span className="text-xs text-fg-subtle">{running ? "Waiting" : "Not run"}</span>;
}

/**
 * Nothing to send to the board. If the cloud already records this version for
 * everything it covers, it's applied; otherwise offer to record it.
 */
function AlreadyMatches({
  appliedLabel,
  recorded,
  canRecord,
  checking,
  busy,
  onRecord,
  feedback,
}: {
  appliedLabel: string;
  recorded: boolean | null;
  canRecord: boolean;
  checking: boolean;
  busy: boolean;
  onRecord: () => void;
  feedback: Feedback | null;
}) {
  if (recorded) {
    return (
      <Callout tone="success">
        {appliedLabel} is already applied to this board. Nothing to send.
      </Callout>
    );
  }
  return (
    <div className="space-y-2">
      <Callout tone="success">
        The board already matches this config. Nothing to send to the board.
      </Callout>
      {canRecord ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={button} disabled={busy || checking} onClick={onRecord}>
            {busy ? "Recording…" : "Record as applied"}
          </button>
          <span className="text-xs text-fg-subtle">
            Records in the cloud that the board is on {appliedLabel}.
          </span>
        </div>
      ) : null}
      <FeedbackCallout feedback={feedback} />
    </div>
  );
}

/** The drivers an applied config was saved with, by board sensor id. */
function driversOf(source: ApplySource | null): { datalogger?: string; sensors: Map<string, string> } {
  const sensors = new Map<string, string>();
  if (!source) return { sensors };
  if (source.kind === "sensor") {
    if (source.sensor.driverId) sensors.set(source.sensor.id.toLowerCase(), source.sensor.driverId);
    return { sensors };
  }
  if (source.kind === "system") {
    for (const sensor of source.sensors) {
      if (sensor.driverId) sensors.set(sensor.id.toLowerCase(), sensor.driverId);
    }
  }
  return { datalogger: source.dataloggerDriverId, sensors };
}
