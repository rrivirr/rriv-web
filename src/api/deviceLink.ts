/**
 * Board-facing cloud calls used by the local-device (Web Serial) flow.
 *
 * Reconciled against `rriv-ctl-tmp/src/api/*`:
 *   - `POST /device`                        (api/device.ts provisionDevice)
 *   - `POST /device/registerEui`            (api/device.ts)
 *   - `GET  /sensor/driver`                 (api/sensor.ts)
 *   - `POST /sensor/config`                 (api/sensor.ts)
 *   - `GET  /datalogger/driver`             (api/datalogger.ts)
 *   - `POST /datalogger/config`             (api/datalogger.ts)
 *
 * `bind`/`unbind` and device-context create already live in `./mutations`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, useApiClient } from "./client";
import { deviceKeys } from "./devices";
import { buildQuery } from "./query";
import type { Device } from "./types";

/** The board type the CLI provisions (`provisionDevice`). */
export const BOARD_TYPE = "rriv_0_4_2";

/**
 * A driver's `validation` is a JSON Schema the API checks configs against
 * with Ajv. Only the subset the config form understands is typed here.
 */
export interface DriverSchema {
  type?: string;
  properties?: Record<string, DriverSchemaProperty>;
  required?: string[];
}

export interface DriverSchemaProperty {
  type?: string | string[];
  enum?: unknown[];
  description?: string;
  title?: string;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
}

export interface Driver {
  id: string;
  name: string;
  validation?: DriverSchema | null;
}

export interface RegisterEuiBody {
  deviceId: string;
  eui: string;
  joinEui: string;
  application?: string;
}

export interface SensorConfigBody {
  name: string;
  sensorDriverId: string;
  deviceId: string;
  contextId: string;
  singlePropertyChange: boolean;
  createdAt: string;
  config: Record<string, unknown>;
}

export interface DataloggerConfigBody {
  name: string;
  dataloggerDriverId: string;
  deviceId: string;
  contextId: string;
  singlePropertyChange: boolean;
  createdAt: string;
  config: Record<string, unknown>;
}

export const driverKeys = {
  sensor: ["sensor", "drivers"] as const,
  datalogger: ["datalogger", "drivers"] as const,
};

export function useSensorDrivers() {
  const api = useApiClient();
  return useQuery({
    queryKey: driverKeys.sensor,
    queryFn: ({ signal }) => api.get<Driver[]>("/sensor/driver", { signal }),
  });
}

export function useDataloggerDrivers() {
  const api = useApiClient();
  return useQuery({
    queryKey: driverKeys.datalogger,
    queryFn: ({ signal }) => api.get<Driver[]>("/datalogger/driver", { signal }),
  });
}

/** The caller's device for a serial number, if it has been linked yet. */
export function useDeviceBySerial(serialNumber: string | null | undefined) {
  const api = useApiClient();
  return useQuery({
    queryKey: deviceKeys.list({ serialNumber: serialNumber ?? undefined }),
    queryFn: ({ signal }) =>
      api.get<Device[]>(`/device${buildQuery({ serialNumber })}`, { signal }),
    enabled: Boolean(serialNumber),
  });
}

/** Create the cloud record for a new board and get its serial number. */
export function useProvisionDevice() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (uid: string) =>
      api.post<Device>("/device", { uid, type: BOARD_TYPE }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["devices"] }),
  });
}

export function useRegisterEui() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterEuiBody) =>
      api.post<void>("/device/registerEui", body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["devices"] }),
  });
}

export function useCreateSensorConfig() {
  const api = useApiClient();
  return useMutation({
    mutationFn: (body: SensorConfigBody) =>
      api.post<void>("/sensor/config", body),
  });
}

export function useCreateDataloggerConfig() {
  const api = useApiClient();
  return useMutation({
    mutationFn: (body: DataloggerConfigBody) =>
      api.post<void>("/datalogger/config", body),
  });
}

/** A friendlier message for the bind errors the CLI special-cases. */
export function bindErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message === "device bound to another user") {
    return "This board is already linked to another RRIV account. Ask the owner to unlink it first.";
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * The driver for an uploaded config: the first one, like rrivctl's
 * `uploadSensorConfig` / `uploadDataloggerConfig`. (A driver id the board
 * itself reports takes precedence; see the upload builders.)
 */
export function pickDriver(drivers: Driver[] | undefined): Driver | null {
  return drivers?.[0] ?? null;
}

interface UploadTarget {
  deviceId: string;
  contextId: string;
  driverId: string;
}

/**
 * Body for `POST /sensor/config` from what the board applied. Mirrors
 * `uploadConfig` → `uploadSensorConfig`: `object` is added, then `id` becomes
 * the name and `id`/`sensorDriverId` are stripped from the config.
 */
export function sensorConfigUpload(
  applied: Record<string, unknown>,
  target: UploadTarget,
): SensorConfigBody {
  const withObject: Record<string, unknown> = { ...applied, object: "sensor" };
  const { id, sensorDriverId, ...config } = withObject;
  return {
    name: String(id ?? ""),
    sensorDriverId: typeof sensorDriverId === "string" ? sensorDriverId : target.driverId,
    deviceId: target.deviceId,
    contextId: target.contextId,
    singlePropertyChange: false,
    createdAt: new Date().toISOString(),
    config,
  };
}

/**
 * Body for `POST /datalogger/config` from what the board reported. Mirrors
 * `uploadDataloggerConfig`.
 */
export function dataloggerConfigUpload(
  applied: Record<string, unknown>,
  target: UploadTarget,
): DataloggerConfigBody {
  const withObject: Record<string, unknown> = { ...applied, object: "datalogger" };
  const { dataloggerDriverId, ...config } = withObject;
  return {
    name: "datalogger",
    dataloggerDriverId:
      typeof dataloggerDriverId === "string" ? dataloggerDriverId : target.driverId,
    deviceId: target.deviceId,
    contextId: target.contextId,
    singlePropertyChange: false,
    createdAt: new Date().toISOString(),
    config,
  };
}
