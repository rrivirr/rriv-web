import type { ConfigSource } from "@/api/deviceLink";
import type { ActiveConfig, ConfigSourceInfo } from "@/api/types";
import type { ApplySource } from "@/serial";

/** The objects a library version (or saved snapshot) sets on a board. */
export interface Covered {
  datalogger: boolean;
  /** Board sensor ids (lower case, as the board stores them). */
  sensorIds: string[];
}

export function coveredObjects(source: ApplySource): Covered {
  if (source.kind === "system") {
    return {
      datalogger: source.datalogger !== null,
      sensorIds: source.sensors.map((sensor) => sensor.id.toLowerCase()),
    };
  }
  if (source.kind === "datalogger") return { datalogger: true, sensorIds: [] };
  return { datalogger: false, sensorIds: [source.sensor.id.toLowerCase()] };
}

const recordedAs = (recorded: ConfigSourceInfo | null | undefined, origin: ConfigSource | null) =>
  origin === null ? !recorded : recorded?.versionId === origin.versionId;

/**
 * Whether the cloud already records every covered object as coming from
 * `origin` (`null`: a saved snapshot, recorded as no library source). Then
 * applying it again would change nothing, so it isn't offered.
 */
export function alreadyRecorded(
  active: ActiveConfig,
  covered: Covered,
  origin: ConfigSource | null,
): boolean {
  if (covered.datalogger) {
    const datalogger = active.dataloggerConfig;
    if (!datalogger?.config || !Object.keys(datalogger.config).length) return false;
    if (!recordedAs(datalogger.source, origin)) return false;
  }
  return covered.sensorIds.every((id) => {
    const sensor = active.sensorConfig.find((entry) => entry.name.toLowerCase() === id);
    return sensor !== undefined && recordedAs(sensor.source, origin);
  });
}
