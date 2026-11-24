import {
  MAX_SENSOR_ID_LENGTH,
  getDatalogger,
  getSensor,
  listSensors,
  unappliedChanges,
} from "./commands";
import type { SerialClient, SerialRecord } from "./protocol";

/**
 * Applying a saved config to a connected board.
 *
 * `planApply` compares the config with what the board reports and lists the
 * commands that would make the board match it. `runApplyPlan` sends them one
 * at a time. The firmware can't apply several commands as one transaction, so
 * a failure part-way leaves the earlier steps applied; the result says exactly
 * which ones.
 */

/** A sensor in a saved config: its id on the board and its settings. */
export interface ConfigSensor {
  id: string;
  config: SerialRecord;
}

/**
 * What to apply:
 * - `system`: the whole board. Sensors on the board that aren't listed are
 *   removed. A `null` datalogger leaves the board's datalogger settings alone.
 * - `datalogger`: only the datalogger settings.
 * - `sensor`: one sensor, added or updated; other sensors are left alone.
 */
export type ApplySource =
  | { kind: "system"; datalogger: SerialRecord | null; sensors: ConfigSensor[] }
  | { kind: "datalogger"; datalogger: SerialRecord }
  | { kind: "sensor"; sensor: ConfigSensor };

/** The board's current config, as it reports it. */
export interface BoardConfig {
  datalogger: SerialRecord | null;
  /** Each sensor's full `sensor get` reply (includes `id` and `type`). */
  sensors: SerialRecord[];
}

export interface SettingChange {
  key: string;
  /** `undefined` when the board doesn't report this setting. */
  from: unknown;
  to: unknown;
}

export type ApplyStep =
  | { kind: "sensor-remove"; id: string; type: string; reason: "not-in-config" | "type-changed" }
  | { kind: "datalogger-set"; changes: SettingChange[]; command: SerialRecord; requested: SerialRecord }
  | { kind: "sensor-add"; id: string; type: string; command: SerialRecord; requested: SerialRecord }
  | { kind: "sensor-set"; id: string; changes: SettingChange[]; command: SerialRecord; requested: SerialRecord };

/** A setting in the config that won't be sent, and why. */
export interface SkippedSetting {
  object: string;
  key: string;
  reason: string;
}

export interface ApplyPlan {
  steps: ApplyStep[];
  skipped: SkippedSetting[];
  /** Reasons the plan can't be applied as it stands. */
  problems: string[];
}

/** The firmware reads at most 499 bytes of a command line (`BUFFER_SIZE` 500, less the terminator). */
export const MAX_COMMAND_BYTES = 499;

/** Byte lengths of the datalogger's fixed-size text fields; the firmware truncates longer values. */
export const DATALOGGER_TEXT_LIMITS: Record<string, number> = {
  logger_name: 8,
  site_name: 8,
  deployment_identifier: 16,
};

/** Datalogger settings `datalogger get` reports under a different name than `datalogger set` takes. */
const DATALOGGER_SET_NAMES: Record<string, string> = {
  bursts_per_measurement_cycle: "bursts_per_cycle",
};

/** Datalogger settings that aren't sent, and why. */
const DATALOGGER_SKIPPED: Record<string, string> = {
  mode: "The mode is switched on the Datalogger tab; applying field mode would stop the board answering.",
  delay_between_bursts: "The firmware can't set this over USB.",
  deployment_timestamp: "The firmware can't set this over USB.",
};

/** Keys that describe the command rather than a setting. */
const ENVELOPE = new Set(["object", "action"]);

const encoder = new TextEncoder();
const byteLength = (text: string) => encoder.encode(text).length;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const asText = (value: unknown) => (typeof value === "string" ? value : "");

function checkCommand(command: SerialRecord, what: string, problems: string[]) {
  const size = byteLength(JSON.stringify(command));
  if (size > MAX_COMMAND_BYTES) {
    problems.push(
      `${what} needs a ${size}-byte command; the board accepts at most ${MAX_COMMAND_BYTES} bytes.`,
    );
  }
}

function planDatalogger(
  board: SerialRecord | null,
  config: SerialRecord,
  skipped: SkippedSetting[],
  problems: string[],
): ApplyStep | null {
  const current = board ?? {};
  const changes: SettingChange[] = [];
  const requested: SerialRecord = {};
  const command: SerialRecord = { object: "datalogger", action: "set" };

  for (const [key, value] of Object.entries(config)) {
    if (ENVELOPE.has(key)) continue;
    const reason = DATALOGGER_SKIPPED[key];
    if (reason) {
      if (!same(current[key], value)) skipped.push({ object: "datalogger", key, reason });
      continue;
    }
    if (same(current[key], value)) continue;
    const limit = DATALOGGER_TEXT_LIMITS[key];
    if (limit !== undefined && typeof value === "string" && byteLength(value) > limit) {
      problems.push(
        `Datalogger ${key} "${value}" is ${byteLength(value)} bytes; the board keeps at most ${limit}.`,
      );
    }
    changes.push({ key, from: current[key], to: value });
    requested[key] = value;
    command[DATALOGGER_SET_NAMES[key] ?? key] = value;
  }

  if (!changes.length) return null;
  checkCommand(command, "The datalogger settings", problems);
  return { kind: "datalogger-set", changes, command, requested };
}

/** A sensor config's settings, without the keys the board fixes or the command carries. */
function sensorSettings(config: SerialRecord): SerialRecord {
  return Object.fromEntries(
    Object.entries(config).filter(
      ([key]) => !ENVELOPE.has(key) && key !== "id" && key !== "type" && key !== "sensorDriverId",
    ),
  );
}

function planSensor(
  board: SerialRecord | undefined,
  sensor: ConfigSensor,
  id: string,
  problems: string[],
): ApplyStep | null {
  const type = asText(sensor.config.type);
  const settings = sensorSettings(sensor.config);

  if (!board || (type && asText(board.type) !== type)) {
    if (!type) {
      problems.push(`Sensor ${id} has no type in the config, so it can't be added to the board.`);
      return null;
    }
    const command: SerialRecord = { object: "sensor", action: "set", id, type, ...settings };
    checkCommand(command, `Sensor ${id}`, problems);
    return { kind: "sensor-add", id, type, command, requested: settings };
  }

  // An existing sensor: the firmware refuses `type` on an update.
  const changes: SettingChange[] = [];
  const requested: SerialRecord = {};
  for (const [key, value] of Object.entries(settings)) {
    if (same(board[key], value)) continue;
    changes.push({ key, from: board[key], to: value });
    requested[key] = value;
  }
  if (!changes.length) return null;
  const command: SerialRecord = { object: "sensor", action: "set", id, ...requested };
  checkCommand(command, `Sensor ${id}`, problems);
  return { kind: "sensor-set", id, changes, command, requested };
}

/**
 * The steps that make the board match `source`, in the order they run:
 * removals first (they free slots and pins for new sensors), then the
 * datalogger, then each sensor. Settings that already match aren't sent.
 */
export function planApply(board: BoardConfig, source: ApplySource): ApplyPlan {
  const steps: ApplyStep[] = [];
  const skipped: SkippedSetting[] = [];
  const problems: string[] = [];

  const onBoard = new Map(board.sensors.map((sensor) => [asText(sensor.id).toLowerCase(), sensor]));
  const wanted =
    source.kind === "system" ? source.sensors : source.kind === "sensor" ? [source.sensor] : [];

  const ids = new Set<string>();
  const sensors: Array<{ id: string; sensor: ConfigSensor }> = [];
  for (const sensor of wanted) {
    const id = sensor.id.trim().toLowerCase();
    if (!id) {
      problems.push("A sensor in the config has no id.");
      continue;
    }
    if (byteLength(id) > MAX_SENSOR_ID_LENGTH) {
      problems.push(`Sensor id "${id}" is longer than ${MAX_SENSOR_ID_LENGTH} characters.`);
      continue;
    }
    if (ids.has(id)) {
      problems.push(`Sensor id "${id}" appears more than once in the config.`);
      continue;
    }
    ids.add(id);
    sensors.push({ id, sensor });
  }

  if (source.kind === "system") {
    for (const [id, existing] of onBoard) {
      if (!ids.has(id)) {
        steps.push({ kind: "sensor-remove", id, type: asText(existing.type), reason: "not-in-config" });
      }
    }
  }
  for (const { id, sensor } of sensors) {
    const existing = onBoard.get(id);
    const type = asText(sensor.config.type);
    if (existing && type && asText(existing.type) !== type) {
      steps.push({ kind: "sensor-remove", id, type: asText(existing.type), reason: "type-changed" });
    }
  }

  const datalogger =
    source.kind === "datalogger" ? source.datalogger : source.kind === "system" ? source.datalogger : null;
  if (datalogger) {
    const step = planDatalogger(board.datalogger, datalogger, skipped, problems);
    if (step) steps.push(step);
  }

  for (const { id, sensor } of sensors) {
    const step = planSensor(onBoard.get(id), sensor, id, problems);
    if (step) steps.push(step);
  }

  return { steps, skipped, problems };
}

/** Read everything `planApply` compares against: datalogger settings and each sensor's config. */
export async function readBoardConfig(client: SerialClient): Promise<BoardConfig> {
  const datalogger = await getDatalogger(client);
  const sensors: SerialRecord[] = [];
  for (const { id } of await listSensors(client)) sensors.push(await getSensor(client, id));
  return { datalogger, sensors };
}

export type StepResult =
  | { status: "done"; reply: SerialRecord; unapplied: ReturnType<typeof unappliedChanges> }
  | { status: "failed"; error: string }
  | { status: "not-run" };

const commandFor = (step: ApplyStep): SerialRecord =>
  step.kind === "sensor-remove" ? { object: "sensor", action: "remove", id: step.id } : step.command;

/**
 * Send `steps` from `start` onwards, one at a time, stopping at the first
 * failure. Every step gets a result; those after a failure are `not-run`.
 * `onProgress` is called after each step with the results so far.
 */
export async function runApplyPlan(
  client: SerialClient,
  steps: ApplyStep[],
  options: { start?: number; previous?: StepResult[]; onProgress?: (results: StepResult[]) => void } = {},
): Promise<StepResult[]> {
  const start = options.start ?? 0;
  const results: StepResult[] = steps.map(
    (_, index) => (index < start ? options.previous?.[index] : undefined) ?? { status: "not-run" },
  );
  for (let index = start; index < steps.length; index += 1) {
    const step = steps[index]!;
    try {
      const reply = await client.send(commandFor(step));
      results[index] = {
        status: "done",
        reply,
        unapplied: step.kind === "sensor-remove" ? [] : unappliedChanges(step.requested, reply),
      };
    } catch (cause) {
      results[index] = { status: "failed", error: cause instanceof Error ? cause.message : String(cause) };
      options.onProgress?.([...results]);
      break;
    }
    options.onProgress?.([...results]);
  }
  return results;
}
