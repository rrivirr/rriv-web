import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { IconArrowLeft } from "@/assets/Icons";
import { pickDriver, useDataloggerDrivers, useSensorDrivers } from "@/api/deviceLink";
import {
  LIBRARY_KINDS,
  type LibraryKind,
  libraryVersions,
  useLibraryConfig,
} from "@/api/library";
import { useCreateLibraryConfig, useUpdateLibraryConfig } from "@/api/libraryManage";
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

interface Draft {
  datalogger: Settings;
  sensorName: string;
  sensor: Settings;
  sensors: { name: string; config: Settings }[];
}

const BLANK: Draft = {
  datalogger: {},
  sensorName: "",
  sensor: { type: "" },
  sensors: [],
};

/** `?copy=<kind>:<id>:<version>`: start from a copy of that version. */
function parseCopy(value: string | null) {
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
      sensors: (snapshot?.SensorConfig ?? []).map((sensor) => ({
        name: sensor.name,
        config: clone(sensor.config),
      })),
    };
  }
  if (kind === "datalogger") {
    return { ...BLANK, datalogger: clone(version.DataloggerConfig?.config ?? {}) };
  }
  return {
    ...BLANK,
    sensorName: version.SensorConfig?.name ?? "",
    sensor: clone(version.SensorConfig?.config ?? { type: "" }),
  };
}

const sensorProblems = (name: string, config: Settings, label: string): string[] => {
  const problems: string[] = [];
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
 * Create a library config from scratch, or from a copy of any version you
 * can see (a plain, independent copy). The API checks the settings against
 * the driver's schema.
 */
export function LibraryNewPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const copy = useMemo(() => parseCopy(params.get("copy")), [params]);
  const kindParam = params.get("kind") ?? "";
  const initialKind: LibraryKind =
    copy?.kind ??
    ((LIBRARY_KINDS as readonly string[]).includes(kindParam) ? (kindParam as LibraryKind) : "system");

  const [kind, setKind] = useState<LibraryKind>(initialKind);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [firmwareVersion, setFirmwareVersion] = useState("");
  const [makePublic, setMakePublic] = useState(false);

  const source = useLibraryConfig(copy?.kind ?? "system", copy?.id);
  const sourceVersion = source.data
    ? libraryVersions(source.data).find((entry) => entry.version === copy?.version)
    : undefined;

  // Start from the copied version once it loads.
  useEffect(() => {
    if (!copy || !sourceVersion) return;
    setKind(copy.kind);
    setDraft(draftFrom(copy.kind, sourceVersion));
    setFirmwareVersion(sourceVersion.firmwareVersion ?? "");
  }, [copy, sourceVersion]);

  const sensorDriver = pickDriver(useSensorDrivers().data);
  const dataloggerDriver = pickDriver(useDataloggerDrivers().data);
  const create = useCreateLibraryConfig();
  const update = useUpdateLibraryConfig();
  const busy = create.isPending || update.isPending;

  const problems = [
    nameProblem(name, "Name"),
    nameProblem(description, "Description", true),
    firmwareVersion.trim() && !FIRMWARE_PATTERN.test(firmwareVersion.trim())
      ? "Firmware version must be 1–32 characters with no spaces."
      : null,
    ...(kind === "sensor" ? sensorProblems(draft.sensorName, draft.sensor, "Sensor") : []),
    ...(kind === "system"
      ? draft.sensors.flatMap((sensor, index) =>
          sensorProblems(sensor.name, sensor.config, `Sensor ${index + 1}`),
        )
      : []),
    kind === "system" && new Set(draft.sensors.map((s) => s.name.trim().toLowerCase())).size !== draft.sensors.length
      ? "Sensor names must be different."
      : null,
  ].filter((problem): problem is string => problem !== null);

  const body = () => {
    const common = {
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(firmwareVersion.trim() ? { firmwareVersion: firmwareVersion.trim() } : {}),
    };
    if (kind === "sensor") {
      return { ...common, sensorName: draft.sensorName.trim(), config: draft.sensor };
    }
    if (kind === "datalogger") return { ...common, config: draft.datalogger };
    return {
      ...common,
      datalogger: draft.datalogger,
      sensors: draft.sensors.map((sensor) => ({ ...sensor.config, name: sensor.name.trim() })),
    };
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (problems.length) return;
    const created = await create.mutateAsync({ kind, body: body() });
    if (makePublic) {
      await update.mutateAsync({ kind, id: created.id, changes: { isPublic: true } });
    }
    navigate(`/library/${kind}/${created.id}`);
  };

  const error = create.error ?? update.error;
  const setSensor = (index: number, next: Partial<Draft["sensors"][number]>) =>
    setDraft((current) => ({
      ...current,
      sensors: current.sensors.map((sensor, at) => (at === index ? { ...sensor, ...next } : sensor)),
    }));

  return (
    <div className="space-y-6">
      <Link
        to="/library"
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition hover:text-fg"
      >
        <IconArrowLeft className="h-4 w-4" />
        Back to library
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">New library config</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {copy
            ? sourceVersion
              ? `Starting from a copy of ${source.data?.name} v${copy.version}. Your config is independent of it.`
              : source.isError
                ? "The config to copy isn't available; starting blank."
                : "Loading the config to copy…"
            : "Start blank, or open a version in the library and choose “Copy to a new config”."}
        </p>
      </header>

      <form className="space-y-6" onSubmit={(event) => void submit(event).catch(() => undefined)}>
        <SectionCard title="About" subtitle="How it appears in the library">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-fg-muted">
              What it configures
              <select
                className="field mt-1"
                value={kind}
                disabled={Boolean(copy)}
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
            <label className="block text-xs text-fg-muted">
              Name
              <input className="field mt-1" value={name} maxLength={20} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="block text-xs text-fg-muted">
              Description (optional)
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
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={makePublic} onChange={(event) => setMakePublic(event.target.checked)} />
            Make it public
          </label>
        </SectionCard>

        {kind !== "sensor" ? (
          <SectionCard title="Datalogger" subtitle="Settings applied to the datalogger">
            <SettingsEditor
              label="Datalogger"
              value={draft.datalogger}
              schema={dataloggerDriver?.validation}
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
            <SettingsEditor
              label="Sensor"
              value={draft.sensor}
              schema={sensorDriver?.validation}
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
                    sensors: [...current.sensors, { name: "", config: { type: "" } }],
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
                    <SettingsEditor
                      label={`Sensor ${index + 1}`}
                      value={sensor.config}
                      schema={sensorDriver?.validation}
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
            <button type="submit" className="btn btn-primary" disabled={busy || problems.length > 0}>
              {busy ? <Spinner /> : "Create library config"}
            </button>
            <Link to="/library" className="btn btn-ghost">
              Cancel
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
