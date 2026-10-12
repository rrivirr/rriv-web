import { type SerialClient, SerialError, type SerialRecord } from "./protocol";

export interface DeviceInfo {
  /** Empty until the board is provisioned. */
  serialNumber: string | null;
  uid: string | null;
  /** Diagnostic codes the board may raise (shown as a warning in the UI). */
  codes: string[];
}

export interface TelemeterInfo {
  devEui: string | null;
  joinEui: string | null;
  /** Set when the telemeter answered with a status message instead of EUIs. */
  message: string | null;
  raw: SerialRecord;
}

export interface SensorSummary {
  id: string;
  type: string;
}

export interface CalibrationPair {
  point: number;
  values: number[];
}

export type CalibrateSubcommand = "point" | "list" | "fit" | "clear";

/** Sensor ids are stored in a 6-byte slot on the board. */
export const MAX_SENSOR_ID_LENGTH = 6;

/** Board uids are 12 bytes, reported as 24 hex characters. */
export const isValidUid = (uid: string) => /^[0-9A-Fa-f]{24}$/.test(uid);

const asString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const messageOf = (response: SerialRecord) => asString(response.message);

/**
 * Coerce a CLI-style property value. Mirrors `setAction`: `"true"`/`"false"`
 * become booleans, numeric strings become numbers, everything else stays text.
 */
export function coerceValue(value: string): string | number | boolean {
  if (value === "true" || value === "false") return value === "true";
  return +value || value;
}

/**
 * Build a `get` payload. Mirrors `rriv-ctl-tmp`'s `getAction`:
 * `board` takes a parameter, everything else takes an optional id (sensors are
 * lower-cased) and parameter.
 */
export function getCommand(
  object: string,
  id?: string,
  parameter?: string,
): SerialRecord {
  const payload: SerialRecord = { object, action: "get" };
  if (object === "board") {
    if (id) payload.parameter = id;
    return payload;
  }
  if (id) payload.id = object === "sensor" ? id.toLowerCase() : id;
  if (parameter) payload.parameter = parameter;
  return payload;
}

/**
 * Build a `set` payload from a config object. Mirrors `setAction`: the
 * properties are merged with `object`, sensor ids are validated and
 * lower-cased, and the caller adds `action: "set"`.
 */
export function setCommand(object: string, props: SerialRecord): SerialRecord {
  const payload: SerialRecord = { ...props, object };
  if (object === "sensor") {
    const id = props.id;
    if (typeof id !== "string" || !id) throw new Error("Sensor id is required.");
    if (id.length > MAX_SENSOR_ID_LENGTH) {
      throw new Error(
        `Sensor id cannot be longer than ${MAX_SENSOR_ID_LENGTH} characters.`,
      );
    }
    payload.id = id.toLowerCase();
  }
  return payload;
}

/** `{"object":"device","action":"get"}` → serial number + board uid. */
export async function readDevice(client: SerialClient): Promise<DeviceInfo> {
  const response = await client.send({ object: "device", action: "get" });
  return {
    serialNumber: asString(response.serial_number) || null,
    uid: asString(response.uid),
    codes: Array.isArray(response.codes) ? response.codes.map(String) : [],
  };
}

/** Board firmware version (the board replies with a JSON-encoded `message`). */
export async function readBoardVersion(
  client: SerialClient,
): Promise<string | null> {
  const response = await client.send({
    object: "board",
    action: "get",
    parameter: "version",
  });
  const message = messageOf(response);
  if (!message) return null;
  try {
    const parsed = JSON.parse(message) as { fv?: unknown };
    return asString(parsed.fv);
  } catch {
    return null;
  }
}

/**
 * LoRaWAN EUIs held by the board's telemeter. Mirrors `registerEuiAction`:
 * a `message` reply means the telemeter is not ready, so ask once more.
 */
export async function readTelemeter(
  client: SerialClient,
): Promise<TelemeterInfo> {
  let response = await client.send({ object: "telemeter", action: "get" });
  if (messageOf(response)) {
    response = await client.send({ object: "telemeter", action: "get" });
  }
  return {
    devEui: asString(response.dev_eui),
    joinEui: asString(response.join_eui),
    message: messageOf(response),
    raw: response,
  };
}

/** Generic `get` for datalogger/sensor/board objects. */
export function getObject(
  client: SerialClient,
  object: string,
  id?: string,
  parameter?: string,
): Promise<SerialRecord> {
  return client.send(getCommand(object, id, parameter));
}

/** Generic `set`; returns the config the board applied. */
export function setObject(
  client: SerialClient,
  object: string,
  props: SerialRecord,
): Promise<SerialRecord> {
  return client.send({ ...setCommand(object, props), action: "set" });
}

/** A sensor's config. The board answers `{"message":…}` when it has no such id. */
export async function getSensor(
  client: SerialClient,
  id: string,
): Promise<SerialRecord> {
  const response = await getObject(client, "sensor", id);
  const message = messageOf(response);
  if (message && Object.keys(response).length === 1) {
    throw new SerialError(message, response);
  }
  return response;
}

/** `sensor list` → the sensors configured on the board. */
export async function listSensors(client: SerialClient): Promise<SensorSummary[]> {
  const response = await client.send({ object: "sensor", action: "list" });
  if (!Array.isArray(response.sensors)) return [];
  return response.sensors.flatMap((entry: unknown) => {
    if (entry === null || typeof entry !== "object") return [];
    const { id, type } = entry as Record<string, unknown>;
    return typeof id === "string" ? [{ id, type: String(type ?? "") }] : [];
  });
}

/** `sensor remove <id>`. */
export async function removeSensor(client: SerialClient, id: string): Promise<void> {
  await client.send({ object: "sensor", action: "remove", id });
}

/** `sensor remove --all`: list, then remove each. Returns the removed ids. */
export async function removeAllSensors(client: SerialClient): Promise<string[]> {
  const sensors = await listSensors(client);
  for (const sensor of sensors) await removeSensor(client, sensor.id);
  return sensors.map((sensor) => sensor.id);
}

/**
 * Parse the board's calibration list. The firmware prints a JS-ish literal
 * (`{ pairs: [{'point': 1, 'values': [2,3] }]}`), not JSON.
 */
export function parseCalibrationList(raw: string): CalibrationPair[] {
  const json = raw.replace(/'/g, '"').replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":');
  try {
    const parsed = JSON.parse(json) as { pairs?: unknown };
    if (!Array.isArray(parsed.pairs)) return [];
    return parsed.pairs.flatMap((pair: unknown) => {
      if (pair === null || typeof pair !== "object") return [];
      const { point, values } = pair as Record<string, unknown>;
      if (typeof point !== "number") return [];
      return [{ point, values: Array.isArray(values) ? values.map(Number) : [] }];
    });
  } catch {
    return [];
  }
}

/** Build a `calibrate` payload. Mirrors `calibrateAction`. */
export function calibrateCommand(
  id: string,
  subcommand: CalibrateSubcommand,
  point?: number,
): SerialRecord {
  const payload: SerialRecord = {
    object: "sensor",
    action: "calibrate",
    id,
    subcommand,
  };
  if (subcommand === "point") {
    if (point === undefined || Number.isNaN(point)) {
      throw new Error("Point subcommand requires a point value.");
    }
    payload.point = point;
  }
  return payload;
}

/** Recorded calibration points for a sensor. */
export async function listCalibration(
  client: SerialClient,
  id: string,
): Promise<CalibrationPair[]> {
  return parseCalibrationList(await client.sendRaw(calibrateCommand(id, "list")));
}

/** `calibrate sensor <id> point|fit|clear`; resolves with the board's message. */
export async function calibrate(
  client: SerialClient,
  id: string,
  subcommand: Exclude<CalibrateSubcommand, "list">,
  point?: number,
): Promise<string | null> {
  const response = await client.send(calibrateCommand(id, subcommand, point));
  return messageOf(response);
}

/** `serial send <message>`: forward text out of the board's USART. */
export function serialSend(client: SerialClient, message: string): Promise<SerialRecord> {
  // The CLI accepts `0x…` and sends the hex digits without the prefix.
  const payload = message.startsWith("0x") ? message.slice(2) : message;
  return client.send({ object: "serial", action: "send", message: payload });
}

/** Write a freshly provisioned serial number to the board. */
export function setSerialNumber(
  client: SerialClient,
  serialNumber: string,
): Promise<SerialRecord> {
  return client.send({ object: "device", action: "set", serial_number: serialNumber });
}

/** Set the board clock to now. Mirrors `applyInitSettings`. */
export async function setClock(client: SerialClient): Promise<void> {
  await client.send({
    object: "board",
    action: "set",
    epoch: Math.floor(Date.now() / 1000),
  });
}

/** `datalogger get`: the board's settings exactly as it reports them. */
export function getDatalogger(client: SerialClient): Promise<SerialRecord> {
  return getObject(client, "datalogger");
}

/** `datalogger set`; resolves with the settings the board reports back. */
export function setDatalogger(client: SerialClient, props: SerialRecord): Promise<SerialRecord> {
  return setObject(client, "datalogger", props);
}

/**
 * Requested changes the board's reply doesn't reflect: the board ignored,
 * truncated or adjusted them. Judged only from what the board reports back.
 * Keys the reply doesn't include are skipped, since there's nothing to compare.
 */
export function unappliedChanges(
  requested: SerialRecord,
  reply: SerialRecord,
): Array<{ key: string; requested: unknown; kept: unknown }> {
  return Object.entries(requested).flatMap(([key, value]) =>
    key in reply && JSON.stringify(reply[key]) !== JSON.stringify(value)
      ? [{ key, requested: value, kept: reply[key] }]
      : [],
  );
}

/** Just the properties of `next` that differ from what the board reported (`current`). */
export function changedProps(current: SerialRecord, next: SerialRecord): SerialRecord {
  return Object.fromEntries(
    Object.entries(next).filter(
      ([key, value]) => JSON.stringify(current[key]) !== JSON.stringify(value),
    ),
  );
}

/** Switch the datalogger mode (`interactive`, `quiet`, `watch`, …). */
export function setMode(client: SerialClient, mode: string): Promise<SerialRecord> {
  return client.send({ object: "datalogger", action: "set", mode });
}

/** Set the board clock and optionally switch the datalogger to interactive. */
export async function applyInitSettings(
  client: SerialClient,
  interactive = true,
): Promise<void> {
  await setClock(client);
  if (interactive) await setMode(client, "interactive");
}
