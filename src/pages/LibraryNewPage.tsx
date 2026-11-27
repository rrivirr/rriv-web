import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { IconArrowLeft } from "@/assets/Icons";
import { type Driver, useDataloggerDrivers, useSensorDrivers } from "@/api/deviceLink";
import {
  LIBRARY_KINDS,
  type LibraryKind,
  libraryVersions,
  useLibraryConfig,
} from "@/api/library";
import { useCreateLibraryConfig, usePublishLibraryVersion, useUpdateLibraryConfig } from "@/api/libraryManage";
import type { LibraryConfigVersion } from "@/api/types";
import { SectionCard } from "@/components/SectionCard";
import { type Settings, SettingsEditor } from "@/components/library/SettingsEditor";
import { Spinner } from "@/components/Spinner";
import { nameProblem } from "@/lib/validation";

const KIND_LABELS: Record<LibraryKind, string> = {
  system: "Whole device (datalogger and sensors)",
  datalogger: "Datalogger settings",
  sensor: "One sensor",
};

/** rriv-api's sensor names: 1–12 characters (the sensor's id on the board is at most 6). */
const SENSOR_NAME_MAX = 12;
/** rriv-api's firmware version pattern: 1–32 printable characters. */
const FIRMWARE_PATTERN = /^[\x21-\x7e]{1,32}$/;

/** Each object carries the driver it's for (chosen by the user); "" = not chosen. */
interface Draft {
  datalogger: Settings;
  dataloggerDriverId: string;
  sensorName: string;
  sensor: Settings;
  sensorDriverId: string;
  sensors: { name: string; config: Settings; driverId: string }[];
}

const BLANK: Draft = {
  datalogger: {},
  dataloggerDriverId: "",
  sensorName: "",
  sensor: { type: "" },
  sensorDriverId: "",
  sensors: [],
};

/**
 * `?copy=<kind>:<id>:<version>` starts a new config from a copy of that
 * version; `?edit=<kind>:<id>:<version>` (owner only) starts the next version
 * of the same config from it.
 */
function parseVersionRef(value: string | null) {
  const [kind, id, version] = value?.split(":") ?? [];
  const number = Number(version);
  if (!kind || !id || !Number.isInteger(number) || number < 1) return null;
  if (!(LIBRARY_KINDS as readonly string[]).includes(kind)) return null;
  return { kind: kind as LibraryKind, id, version: number };
}

/** The editable draft from a library version (copied, not linked). */
function draftFrom(kind: LibraryKind, version: LibraryConfigVersion): Draft {
  const clone = <T,>(value: T): T => structuredClone(value);
  if (kind === "system") {
    const snapshot = version.ConfigSnapshot;
    return {
      ...BLANK,
      datalogger: clone(snapshot?.DataloggerConfig?.[0]?.config ?? {}),
      dataloggerDriverId: snapshot?.DataloggerConfig?.[0]?.dataloggerDriverId ?? "",
      sensors: (snapshot?.SensorConfig ?? []).map((sensor) => ({
        name: sensor.name,
        config: clone(sensor.config),
        driverId: sensor.sensorDriverId ?? "",
      })),
    };
  }
  if (kind === "datalogger") {
    return {
      ...BLANK,
      datalogger: clone(version.DataloggerConfig?.config ?? {}),
      dataloggerDriverId: version.DataloggerConfig?.dataloggerDriverId ?? "",
    };
  }
  return {
    ...BLANK,
    sensorName: version.SensorConfig?.name ?? "",
    sensor: clone(version.SensorConfig?.config ?? { type: "" }),
    sensorDriverId: version.SensorConfig?.sensorDriverId ?? "",
  };
}

const sensorProblems = (
  name: string,
  config: Settings,
  driverId: string,
  label: string,
): string[] => {
  const problems: string[] = [];
  if (!driverId) problems.push(`${label}: choose a driver.`);
  const trimmed = name.trim();
  if (!trimmed) problems.push(`${label}: a sensor name is required.`);
  else if (trimmed.length > SENSOR_NAME_MAX) {
    problems.push(`${label}: the sensor name must be at most ${SENSOR_NAME_MAX} characters.`);
  }
  if (typeof config.type !== "string" || !config.type.trim()) {
    problems.push(`${label}: a sensor type is required.`);
  }
  return problems;
};

/**
 * Create a library config from scratch or from a copy of any version you can
 * see (a plain, independent copy), or edit one of your versions into the next
 * version of the same config. The API checks the settings against the
 * driver's schema and numbers versions itself.
 */
export function LibraryNewPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const edit = useMemo(() => parseVersionRef(params.get("edit")), [params]);
  const copy = useMemo(() => (edit ? null : parseVersionRef(params.get("copy"))), [edit, params]);
  const from = edit ?? copy;
  const kindParam = params.get("kind") ?? "";
  const initialKind: LibraryKind =
    from?.kind ??
    ((LIBRARY_KINDS as readonly string[]).includes(kindParam) ? (kindParam as LibraryKind) : "system");

  const [kind, setKind] = useState<LibraryKind>(initialKind);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [firmwareVersion, setFirmwareVersion] = useState("");
  const [makePublic, setMakePublic] = useState(false);

  const source = useLibraryConfig(from?.kind ?? "system", from?.id);
  const sourceVersions = source.data ? libraryVersions(source.data) : [];
  const sourceVersion = sourceVersions.find((entry) => entry.version === from?.version);
  const nextVersion = Math.max(0, ...sourceVersions.map((entry) => entry.version)) + 1;
  /** Only the owner can add versions; the API refuses anyone else too. */
  const notOwner = Boolean(edit && source.data && !source.data.isMine);

  // Start from the chosen version once it loads.
  useEffect(() => {
    if (!from || !sourceVersion) return;
    setKind(from.kind);
    setDraft(draftFrom(from.kind, sourceVersion));
    setFirmwareVersion(sourceVersion.firmwareVersion ?? "");
  }, [from, sourceVersion]);

  const sensorDrivers = useSensorDrivers().data ?? [];
  const dataloggerDrivers = useDataloggerDrivers().data ?? [];
  const schemaOf = (drivers: Driver[], id: string) =>
    drivers.find((driver) => driver.id === id)?.validation ?? null;
  const create = useCreateLibraryConfig();
  const update = useUpdateLibraryConfig();
  const publish = usePublishLibraryVersion();
  const busy = create.isPending || update.isPending || publish.isPending;
  const descriptionLabel = edit ? "Version note" : "Description";

  const problems = [
    edit ? null : nameProblem(name, "Name"),
    nameProblem(description, descriptionLabel, true),
    edit && !sourceVersion ? "The version to edit hasn't loaded." : null,
    firmwareVersion.trim() && !FIRMWARE_PATTERN.test(firmwareVersion.trim())
      ? "Firmware version must be 1–32 characters with no spaces."
      : null,
    ...(kind === "sensor"
      ? sensorProblems(draft.sensorName, draft.sensor, draft.sensorDriverId, "Sensor")
      : []),
    kind !== "sensor" && !draft.dataloggerDriverId ? "Datalogger: choose a driver." : null,
    ...(kind === "system"
      ? draft.sensors.flatMap((sensor, index) =>
          sensorProblems(sensor.name, sensor.config, sensor.driverId, `Sensor ${index + 1}`),
        )
      : []),
    kind === "system" && new Set(draft.sensors.map((s) => s.name.trim().toLowerCase())).size !== draft.sensors.length
      ? "Sensor names must be different."
      : null,
  ].filter((problem): problem is string => problem !== null);

  const body = () => {
    const common = {
      // A new version keeps its config's name.
      ...(edit ? {} : { name: name.trim() }),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(firmwareVersion.trim() ? { firmwareVersion: firmwareVersion.trim() } : {}),
    };
    if (kind === "sensor") {
      return {
        ...common,
        sensorName: draft.sensorName.trim(),
        sensorDriverId: draft.sensorDriverId,
        config: draft.sensor,
      };
    }
    if (kind === "datalogger") {
      return { ...common, dataloggerDriverId: draft.dataloggerDriverId, config: draft.datalogger };
    }
    return {
      ...common,
      dataloggerDriverId: draft.dataloggerDriverId,
      datalogger: draft.datalogger,
      sensors: draft.sensors.map((sensor) => ({
        ...sensor.config,
        name: sensor.name.trim(),
        sensorDriverId: sensor.driverId,
      })),
    };
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (problems.length || notOwner) return;
    if (edit) {
      await publish.mutateAsync({ kind, id: edit.id, body: body() });
      navigate(`/library/${kind}/${edit.id}`);
      return;
    }
    const created = await create.mutateAsync({ kind, body: body() });
    if (makePublic) {
      await update.mutateAsync({ kind, id: created.id, changes: { isPublic: true } });
    }
    navigate(`/library/${kind}/${created.id}`);
  };

  const error = create.error ?? update.error ?? publish.error;
  const backTo = edit ? `/library/${edit.kind}/${edit.id}` : "/library";
  const setSensor = (index: number, next: Partial<Draft["sensors"][number]>) =>
    setDraft((current) => ({
      ...current,
      sensors: current.sensors.map((sensor, at) => (at === index ? { ...sensor, ...next } : sensor)),
    }));

  return (
    <div className="space-y-6">
      <Link
        to={backTo}
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition hover:text-fg"
      >
        <IconArrowLeft className="h-4 w-4" />
        {edit ? "Back to config" : "Back to library"}
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          {edit ? (source.data ? `New version of ${source.data.name}` : "New version") : "New library config"}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          {edit
            ? notOwner
              ? "Only the config's owner can add versions. Copy it to a new config instead."
              : sourceVersion
                ? `Starting from v${edit.version}. Publishing adds v${nextVersion}; earlier versions stay as they are.`
                : source.isError
                  ? "The version to edit isn't available."
                  : "Loading the version to edit…"
            : copy
            ? sourceVersion
              ? `Starting from a copy of ${source.data?.name} v${copy.version}. Your config is independent of it.`
              : source.isError
                ? "The config to copy isn't available; starting blank."
                : "Loading the config to copy…"
            : "Start blank, or open a version in the library and choose “Copy to a new config”."}
        </p>
      </header>

      <form className="space-y-6" onSubmit={(event) => void submit(event).catch(() => undefined)}>
        <SectionCard
          title="About"
          subtitle={edit ? "Shown with this version in the library" : "How it appears in the library"}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-fg-muted">
              What it configures
              <select
                className="field mt-1"
                value={kind}
                disabled={Boolean(from)}
                onChange={(event) => {
                  setKind(event.target.value as LibraryKind);
                  setDraft(BLANK);
                }}
              >
                {LIBRARY_KINDS.map((option) => (
                  <option key={option} value={option}>
                    {KIND_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
            {edit ? null : (
              <label className="block text-xs text-fg-muted">
                Name
                <input className="field mt-1" value={name} maxLength={20} onChange={(event) => setName(event.target.value)} />
              </label>
            )}
            <label className="block text-xs text-fg-muted">
              {descriptionLabel} (optional)
              <input
                className="field mt-1"
                value={description}
                maxLength={20}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <label className="block text-xs text-fg-muted">
              Firmware version (optional)
              <input
                className="field mt-1"
                placeholder="e.g. 1.4.0"
                value={firmwareVersion}
                maxLength={32}
                onChange={(event) => setFirmwareVersion(event.target.value)}
              />
            </label>
          </div>
          {edit ? null : (
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={makePublic} onChange={(event) => setMakePublic(event.target.checked)} />
              Make it public
            </label>
          )}
        </SectionCard>

        {kind !== "sensor" ? (
          <SectionCard title="Datalogger" subtitle="Settings applied to the datalogger">
            <DriverPicker
              label="Datalogger driver"
              drivers={dataloggerDrivers}
              value={draft.dataloggerDriverId}
              onChange={(dataloggerDriverId) => setDraft((current) => ({ ...current, dataloggerDriverId }))}
            />
            <SettingsEditor
              label="Datalogger"
              value={draft.datalogger}
              schema={schemaOf(dataloggerDrivers, draft.dataloggerDriverId)}
              onChange={(datalogger) => setDraft((current) => ({ ...current, datalogger }))}
            />
          </SectionCard>
        ) : null}

        {kind === "sensor" ? (
          <SectionCard title="Sensor" subtitle="The sensor's id on the board, and its settings (type is required)">
            <label className="mb-3 block max-w-xs text-xs text-fg-muted">
              Sensor name (id on the board)
              <input
                className="field mt-1 font-mono"
                value={draft.sensorName}
                maxLength={SENSOR_NAME_MAX}
                onChange={(event) => setDraft((current) => ({ ...current, sensorName: event.target.value }))}
              />
            </label>
            <DriverPicker
              label="Sensor driver"
              drivers={sensorDrivers}
              value={draft.sensorDriverId}
              onChange={(sensorDriverId) => setDraft((current) => ({ ...current, sensorDriverId }))}
            />
            <SettingsEditor
              label="Sensor"
              value={draft.sensor}
              schema={schemaOf(sensorDrivers, draft.sensorDriverId)}
              onChange={(sensor) => setDraft((current) => ({ ...current, sensor }))}
            />
          </SectionCard>
        ) : null}

        {kind === "system" ? (
          <SectionCard
            title="Sensors"
            subtitle="Applying this config makes a board have exactly these sensors"
            action={
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    sensors: [...current.sensors, { name: "", config: { type: "" }, driverId: "" }],
                  }))
                }
              >
                Add sensor
              </button>
            }
          >
            {draft.sensors.length === 0 ? (
              <p className="text-sm text-fg-subtle">No sensors: applying it removes every sensor from a board.</p>
            ) : (
              <div className="space-y-4">
                {draft.sensors.map((sensor, index) => (
                  <div key={index} className="space-y-3 rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <label className="block text-xs text-fg-muted">
                        Sensor {index + 1} name (id on the board)
                        <input
                          className="field mt-1 font-mono"
                          value={sensor.name}
                          maxLength={SENSOR_NAME_MAX}
                          onChange={(event) => setSensor(index, { name: event.target.value })}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-ghost text-red-500"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            sensors: current.sensors.filter((_, at) => at !== index),
                          }))
                        }
                      >
                        Remove sensor {index + 1}
                      </button>
                    </div>
                    <DriverPicker
                      label={`Sensor ${index + 1} driver`}
                      drivers={sensorDrivers}
                      value={sensor.driverId}
                      onChange={(driverId) => setSensor(index, { driverId })}
                    />
                    <SettingsEditor
                      label={`Sensor ${index + 1}`}
                      value={sensor.config}
                      schema={schemaOf(sensorDrivers, sensor.driverId)}
                      onChange={(config) => setSensor(index, { config })}
                    />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        ) : null}

        <div className="space-y-2">
          {problems.length > 0 && (name || draft !== BLANK) ? (
            <ul className="space-y-1 text-xs text-amber-600">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
          {error ? <p className="text-xs text-red-500">{error.message}</p> : null}
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={busy || notOwner || problems.length > 0}>
              {busy ? <Spinner /> : edit ? `Publish v${nextVersion}` : "Create library config"}
            </button>
            <Link to={backTo} className="btn btn-ghost">
              Cancel
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}

/** Which driver a config is for; its schema shapes the editor and the API checks against it. */
function DriverPicker({
  label,
  drivers,
  value,
  onChange,
}: {
  label: string;
  drivers: Driver[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="mb-3 block max-w-xs text-xs text-fg-muted">
      {label}
      <select className="field mt-1" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{drivers.length ? "Choose a driver" : "No drivers available"}</option>
        {drivers.map((driver) => (
          <option key={driver.id} value={driver.id}>
            {driver.name}
          </option>
        ))}
      </select>
    </label>
  );
}
