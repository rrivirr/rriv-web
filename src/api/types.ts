/**
 * Response shapes for the RRIV REST API, derived from its OpenAPI document
 * (GET /version.yaml) and the API repositories. Only the fields the UI consumes
 * are listed; the API may return more.
 *
 * Note: the API's Prisma client globally omits `accountId`/`creatorId`/
 * `archivedAt`, so `Context.accountId` is never present — ownership is exposed
 * through the nested `Account` relation instead.
 */

export interface AccountRef {
  id: string;
  email: string;
}

export interface Context {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string | null;
  Account?: AccountRef;
}

export interface DeviceContextLink {
  assignedDeviceName: string;
  Context: { id: string; name: string };
}

export interface DeviceEui {
  eui: string;
}

export interface Device {
  id: string;
  serialNumber: string;
  uniqueName: string;
  createdAt: string;
  /** Present in the database, may be omitted by some responses. */
  uid?: string;
  type?: string;
  DeviceContext?: DeviceContextLink[];
  DeviceEuis?: DeviceEui[];
}

/** A device's active membership in a context (`GET /context/:cid/device/:did`). */
export interface DeviceContext {
  id: string;
  deviceId: string;
  contextId: string;
  assignedDeviceName: string;
  startedAt: string;
  endedAt: string | null;
  configSnapshotId: string;
}

/**
 * The library version a device's config came from (`null`: set by hand, from
 * a saved snapshot, or before sources were recorded).
 */
export interface ConfigSourceInfo {
  kind: "sensor" | "datalogger" | "system";
  versionId: string;
  version: number;
  libraryConfigId: string;
  name: string;
  latestVersion: number | null;
  updateAvailable: boolean;
  /** Settings that differ from that version. */
  changedSettings: number;
}

/** `GET /configSnapshot/active` — the config currently applied to a device+context. */
export interface ActiveConfig {
  dataloggerConfig: {
    config?: Record<string, unknown>;
    /** The driver the datalogger config is recorded with. */
    dataloggerDriverId?: string | null;
    source?: ConfigSourceInfo | null;
  } | null;
  sensorConfig: {
    id: string;
    name: string;
    config: Record<string, unknown>;
    sensorDriverId?: string;
    source?: ConfigSourceInfo | null;
  }[];
}

/** One row of `GET /configSnapshot/history`. */
export interface ConfigHistoryItem {
  id: string;
  name: string;
  config: Record<string, unknown>;
  active: boolean;
  createdAt: string;
  deactivatedAt: string | null;
  sensorDriverId?: string;
  dataloggerDriverId?: string;
  /** Present once the API includes the creator on history queries. */
  Creator?: { firstName: string; lastName: string };
  creatorId?: string;
  /** Per-key diff against the previous config of the same name. */
  changesMade?: Record<string, string>;
  ConfigSnapshot?: {
    DeviceContext?: { Context?: { name: string } };
  };
}

export interface ConfigHistory {
  dataloggerConfigs: ConfigHistoryItem[];
  sensorConfigs: ConfigHistoryItem[];
}

/** `GET /device/firmware/history`. */
export interface FirmwareHistoryItem {
  version: string;
  installedAt: string;
  createdAt: string;
  contextName?: string;
}

/** `GET /device/log`. */
export interface DeviceLogItem {
  log: string;
  createdAt: string;
  Creator?: { firstName: string; lastName: string };
}

/* ------------------------------------------------------------------ Library */

export interface LibraryCreator {
  firstName: string;
  lastName: string;
}

/**
 * List-item shape shared by the sensor / datalogger / system libraries.
 *
 * The creator relation comes back as `Creator` (Prisma relation name); the
 * hand-written OpenAPI document spells it `creator`, so both are accepted.
 */
export interface LibraryConfigSummary {
  id: string;
  name: string;
  description?: string | null;
  isPublic?: boolean;
  /** An official RRIV config (always public; set by admins). */
  isOfficial?: boolean;
  creatorId?: string;
  createdAt: string;
  Creator?: LibraryCreator;
  creator?: LibraryCreator;
}

/** A concrete config embedded in a library version. */
export interface LibraryVersionConfigRef {
  id: string;
  name: string;
  config: Record<string, unknown>;
  sensorDriverId?: string;
  dataloggerDriverId?: string;
}

/** The full snapshot embedded in a system-library version. */
export interface LibrarySnapshotRef {
  id: string;
  name: string;
  SensorConfig: {
    id: string;
    name: string;
    config: Record<string, unknown>;
    sensorDriverId?: string;
  }[];
  DataloggerConfig: {
    id: string;
    config: Record<string, unknown>;
    dataloggerDriverId?: string;
  }[];
}

/** One published version of a library config. */
export interface LibraryConfigVersion {
  /** The version row's id; what a device config records as its source. */
  id?: string;
  version: number;
  /** Firmware the config was saved with, when the publisher recorded it. */
  firmwareVersion?: string | null;
  description?: string | null;
  Creator?: LibraryCreator;
  creator?: LibraryCreator;
  SensorConfig?: LibraryVersionConfigRef;
  DataloggerConfig?: LibraryVersionConfigRef;
  ConfigSnapshot?: LibrarySnapshotRef;
}

/** Detail returned by `GET /{kind}/libraryConfig/:id`. */
export interface LibraryConfigDetail extends LibraryConfigSummary {
  /** The caller owns it (edit, archive, publish versions). */
  isMine?: boolean;
  SensorLibraryConfigVersion?: LibraryConfigVersion[];
  DataloggerLibraryConfigVersion?: LibraryConfigVersion[];
  SystemLibraryConfigVersion?: LibraryConfigVersion[];
}
