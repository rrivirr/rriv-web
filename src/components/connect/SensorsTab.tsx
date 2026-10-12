import { type FormEvent, useCallback, useEffect, useState } from "react";
import { pickDriver } from "@/api/deviceLink";
import { EmptyState } from "@/components/EmptyState";
import { SectionCard } from "@/components/SectionCard";
import {
  type CalibrationPair,
  MAX_SENSOR_ID_LENGTH,
  type SensorSummary,
  type SerialClient,
  type SerialRecord,
  calibrate,
  changedProps,
  getSensor,
  listCalibration,
  listSensors,
  removeAllSensors,
  removeSensor,
  setObject,
} from "@/serial";
import { ConfigForm, parseJsonObject } from "./ConfigForm";
import { reportApply, syncFeedback } from "./syncFeedback";
import type { BoardLink } from "./useBoardLink";
import { ConfirmButton, type Feedback, FeedbackCallout, button, input, label, primary, useTask } from "./ui";

/** Properties the board fixes once a sensor exists. */
const SENSOR_READ_ONLY = ["id"];

export function SensorsTab({
  client,
  link,
  locked,
}: {
  client: SerialClient;
  link: BoardLink;
  locked: boolean;
}) {
  const list = useTask();
  const [sensors, setSensors] = useState<SensorSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  /** Result of adding a sensor, shown on the new sensor's panel. */
  const [notice, setNotice] = useState<Feedback | null>(null);

  const refresh = useCallback(
    () =>
      list.run("list", async () => {
        const next = await listSensors(client);
        setSensors(next);
        setSelected((current) =>
          current && next.some((sensor) => sensor.id === current) ? current : (next[0]?.id ?? null),
        );
      }),
    [client, list.run],
  );

  useEffect(() => {
    if (!locked) void refresh();
  }, [locked, refresh]);

  const disabled = locked || list.busy !== null;

  return (
    <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <SectionCard
        title="Sensors"
        subtitle="Configured on the board."
        action={
          <button type="button" className={button} disabled={disabled} onClick={() => void refresh()}>
            {list.busy === "list" ? "Reading…" : "Refresh"}
          </button>
        }
      >
        <div className="space-y-3">
          {sensors?.length ? (
            <ul className="space-y-1" aria-label="Sensors on the board">
              {sensors.map((sensor) => (
                <li key={sensor.id}>
                  <button
                    type="button"
                    aria-current={selected === sensor.id && !adding}
                    onClick={() => {
                      setNotice(null);
                      setAdding(false);
                      setSelected(sensor.id);
                    }}
                    className={[
                      "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
                      selected === sensor.id && !adding
                        ? "bg-accent/10 text-fg"
                        : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                    ].join(" ")}
                  >
                    <span className="font-mono">{sensor.id}</span>
                    <span className="truncate text-xs text-fg-subtle">{sensor.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : sensors ? (
            <p className="text-xs text-fg-subtle">No sensors configured yet.</p>
          ) : null}
          <FeedbackCallout feedback={list.feedback} />
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <button type="button" className={primary} disabled={disabled} onClick={() => setAdding(true)}>
              Add sensor
            </button>
            {sensors?.length ? (
              <ConfirmButton
                disabled={disabled}
                confirmLabel="Remove all?"
                onConfirm={() =>
                  void list.run("remove-all", async () => {
                    const removed = await removeAllSensors(client);
                    setSensors([]);
                    setSelected(null);
                    return { tone: "success", message: `Removed ${removed.length} sensor(s).` };
                  })
                }
              >
                Remove all
              </ConfirmButton>
            ) : null}
          </div>
        </div>
      </SectionCard>

      {adding ? (
        <AddSensor
          client={client}
          link={link}
          locked={locked}
          onCancel={() => setAdding(false)}
          onNotice={setNotice}
          onAdded={(id, feedback) => {
            setNotice(feedback);
            setAdding(false);
            setSelected(id);
            void refresh();
          }}
        />
      ) : selected ? (
        <SensorDetail
          key={selected}
          client={client}
          link={link}
          id={selected}
          locked={locked}
          notice={notice}
          onRemoved={() => {
            setSelected(null);
            void refresh();
          }}
        />
      ) : (
        <EmptyState
          title="No sensor selected"
          description="Pick a sensor to edit its config and calibration, or add a new one."
        />
      )}
    </div>
  );
}

function SensorDetail({
  client,
  link,
  id,
  locked,
  notice,
  onRemoved,
}: {
  client: SerialClient;
  link: BoardLink;
  id: string;
  locked: boolean;
  notice: Feedback | null;
  onRemoved: () => void;
}) {
  const task = useTask();
  const [config, setConfig] = useState<SerialRecord | null>(null);

  useEffect(() => {
    void task.run("read", async () => setConfig(await getSensor(client, id)));
  }, [client, id, task.run]);

  const type = typeof config?.type === "string" ? config.type : null;
  const driver = pickDriver(link.sensorDrivers.data);

  const apply = (changes: SerialRecord) =>
    void task.run("apply", async () => {
      // Only what differs from what the board reported is sent; the id picks the slot.
      const requested = changedProps(config ?? {}, changes);
      if (!Object.keys(requested).length) {
        return { tone: "info", message: "Nothing to apply: no setting differs from what the board reported." };
      }
      const applied = await setObject(client, "sensor", { ...requested, id });
      setConfig(applied);
      return reportApply(
        "Sensor config",
        requested,
        applied,
        () => link.syncSensor(applied),
        task.setFeedback,
      );
    });

  return (
    <div className="space-y-5">
      <SectionCard
        title={`Sensor ${id}`}
        subtitle={type ? `Type ${type}${driver ? ` · driver ${driver.name}` : ""}` : "Reading…"}
        action={
          <ConfirmButton
            disabled={locked || task.busy !== null}
            aria-label={`Remove sensor ${id}`}
            confirmLabel="Remove?"
            onConfirm={() =>
              void task.run("remove", async () => {
                await removeSensor(client, id);
                onRemoved();
              })
            }
          >
            Remove
          </ConfirmButton>
        }
      >
        <div className="space-y-4">
          <FeedbackCallout feedback={task.feedback ?? (task.busy ? null : notice)} />
          {config ? (
            <ConfigForm
              name="Sensor"
              values={config}
              schema={driver?.validation}
              readOnly={SENSOR_READ_ONLY}
              disabled={locked}
              busy={task.busy === "apply"}
              onApply={apply}
            />
          ) : null}
        </div>
      </SectionCard>
      <Calibration client={client} id={id} locked={locked} />
    </div>
  );
}

function AddSensor({
  client,
  link,
  locked,
  onCancel,
  onAdded,
  onNotice,
}: {
  client: SerialClient;
  link: BoardLink;
  locked: boolean;
  onCancel: () => void;
  onAdded: (id: string, feedback: Feedback) => void;
  onNotice: (feedback: Feedback) => void;
}) {
  const task = useTask();
  const [id, setId] = useState("");
  const [type, setType] = useState("");
  const [extra, setExtra] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void task.run("add", async () => {
      const props = extra.trim() ? parseJsonObject(extra) : {};
      const applied = await setObject(client, "sensor", { ...props, id, type });
      const retry = () => link.syncSensor(applied);
      const outcome = await retry();
      onAdded(
        typeof applied.id === "string" ? applied.id : id.toLowerCase(),
        // This form unmounts once the sensor exists, so a retry reports to the parent.
        syncFeedback("Sensor", outcome, retry, onNotice),
      );
    });
  };

  return (
    <SectionCard title="Add a sensor" subtitle="Creates a new sensor slot on the board.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Sensor id</span>
            <input
              className={`${input} mt-1 font-mono`}
              value={id}
              maxLength={MAX_SENSOR_ID_LENGTH}
              placeholder="e.g. temp01"
              onChange={(event) => setId(event.target.value)}
            />
            <span className="mt-1 block text-xs text-fg-subtle">
              Up to {MAX_SENSOR_ID_LENGTH} characters, stored lower-case.
            </span>
          </label>
          <label className="block">
            <span className={label}>Type</span>
            <input
              className={`${input} mt-1 font-mono`}
              value={type}
              placeholder="e.g. ring_temperature"
              onChange={(event) => setType(event.target.value)}
            />
          </label>
        </div>
        <label className="block">
          <span className={label}>Other properties (JSON, optional)</span>
          <textarea
            className={`${input} mt-1 h-28 font-mono text-xs`}
            spellCheck={false}
            placeholder='{"wait_time": 5}'
            value={extra}
            onChange={(event) => setExtra(event.target.value)}
          />
        </label>
        <FeedbackCallout feedback={task.feedback} />
        <div className="flex gap-2">
          <button
            type="submit"
            className={primary}
            disabled={locked || task.busy !== null || !id.trim() || !type.trim()}
          >
            {task.busy ? "Adding…" : "Add to board"}
          </button>
          <button type="button" className={button} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

function Calibration({ client, id, locked }: { client: SerialClient; id: string; locked: boolean }) {
  const task = useTask();
  const [pairs, setPairs] = useState<CalibrationPair[] | null>(null);
  const [point, setPoint] = useState("");
  const disabled = locked || task.busy !== null;

  const load = () => task.run("list", async () => setPairs(await listCalibration(client, id)));

  const step = (subcommand: "point" | "fit" | "clear", value?: number) =>
    void task.run(subcommand, async () => {
      const message = await calibrate(client, id, subcommand, value);
      if (subcommand !== "fit") setPairs(await listCalibration(client, id));
      if (subcommand === "point") setPoint("");
      return { tone: "success", message: message ?? "Done." };
    });

  return (
    <SectionCard
      title="Calibration"
      subtitle="Record reference points, then fit the sensor's calibration to them."
      action={
        <button type="button" className={button} disabled={disabled} onClick={() => void load()}>
          {task.busy === "list" ? "Reading…" : pairs ? "Refresh" : "Load points"}
        </button>
      }
    >
      <div className="space-y-4">
        {pairs ? (
          pairs.length ? (
            <table className="w-full text-left font-mono text-xs">
              <thead className="text-fg-subtle">
                <tr>
                  <th className="py-1 pr-4 font-normal">point</th>
                  <th className="py-1 font-normal">values</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((pair, index) => (
                  <tr key={index} className="border-t border-border">
                    <td className="py-1 pr-4 text-fg">{pair.point}</td>
                    <td className="py-1 text-fg-muted">{pair.values.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-fg-subtle">No calibration points recorded.</p>
          )
        ) : null}
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            step("point", parseFloat(point));
          }}
        >
          <label className="block sm:w-48">
            <span className={label}>Reference value</span>
            <input
              className={`${input} mt-1`}
              type="number"
              step="any"
              inputMode="decimal"
              value={point}
              onChange={(event) => setPoint(event.target.value)}
            />
          </label>
          <button type="submit" className={button} disabled={disabled || point.trim() === ""}>
            {task.busy === "point" ? "Recording…" : "Record point"}
          </button>
          <button type="button" className={primary} disabled={disabled} onClick={() => step("fit")}>
            {task.busy === "fit" ? "Fitting…" : "Fit"}
          </button>
          <ConfirmButton disabled={disabled} confirmLabel="Clear calibration?" onConfirm={() => step("clear")}>
            Clear
          </ConfirmButton>
        </form>
        <FeedbackCallout feedback={task.feedback} />
      </div>
    </SectionCard>
  );
}
