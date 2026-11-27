import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/api/client";
import {
  type ConfigSource,
  bindErrorMessage,
  dataloggerConfigUpload,
  pickDriver,
  sensorConfigUpload,
  useCreateDataloggerConfig,
  useCreateDeviceLog,
  useCreateFirmwareEntry,
  useCreateSensorConfig,
  useDataloggerDrivers,
  useDeactivateSensorConfig,
  useDeviceBySerial,
  useProvisionDevice,
  useRegisterEui,
  useSensorDrivers,
} from "@/api/deviceLink";
import { useBindDevice, useCreateDeviceContext } from "@/api/mutations";
import { useMe } from "@/api/me";
import type { Device } from "@/api/types";
import {
  DATALOGGER_RESET,
  type SerialConnection,
  type SerialRecord,
  SerialTimeoutError,
  deviceReset,
  type StartupReport,
  getDatalogger,
  isValidUid,
  readStartupReport,
  readTelemeter,
  setSerialNumber,
} from "@/serial";

/**
 * Where the connected board is in setup, in the order `rrivctl` walks it:
 * provision (no serial number) → bind to the account → place in a context.
 *
 * Only `no-context` and `ready` mean the board is confirmed as the caller's;
 * every other stage keeps the board tools locked.
 */
export type SetupStage =
  | "reading"
  /** No serial number, and the caller can provision. */
  | "unprovisioned"
  /** No serial number, and the caller can't provision. */
  | "needs-provisioner"
  | "checking"
  | "cloud-error"
  /** Bound to another RRIV account. */
  | "foreign"
  /** Has a serial number RRIV doesn't know (e.g. another environment). */
  | "unregistered"
  | "no-context"
  | "ready";

/** Outcome of binding the board on connect, like `rrivctl connect`. */
type Claim =
  | { serial: string; status: "pending" }
  | { serial: string; status: "bound"; device: Device }
  | { serial: string; status: "foreign" | "unregistered" }
  | { serial: string; status: "error"; error: string };

export type SyncOutcome =
  | { kind: "synced" }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; error: string };

/** Recording a firmware install in the device's history; `outcome` is null while it's sent. */
export interface FirmwareRecord {
  installedAt: string;
  outcome: SyncOutcome | null;
}

/**
 * A reset asked for in this session and what happened in the cloud after it.
 * `outcome` is null until the cloud step has run.
 */
export type ResetNotice =
  /** Default settings recorded once the board is back. */
  | { kind: "datalogger"; outcome: SyncOutcome | null }
  /** The board wiped; its device stays in rriv-api, bound as before. */
  | { kind: "factory"; serialNumber: string };

interface Placement {
  deviceId: string;
  contextId: string;
}

const notLinkedFirmware: SyncOutcome = {
  kind: "skipped",
  reason: "Link this board to a context to record the install in its firmware history.",
};

const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

export function useBoardLink(serial: SerialConnection) {
  const serialNumber = serial.info?.serialNumber ?? null;
  const deviceQuery = useDeviceBySerial(serialNumber);
  const me = useMe();
  const [claim, setClaim] = useState<Claim | null>(null);
  /** The board was bound during this session, so its config is uploaded once placed (`pullConfig`). */
  const [freshlyBound, setFreshlyBound] = useState<string | null>(null);

  const sensorDrivers = useSensorDrivers();
  const dataloggerDrivers = useDataloggerDrivers();
  const provisionDevice = useProvisionDevice();
  const bind = useBindDevice();
  const createDeviceContext = useCreateDeviceContext();
  const registerEui = useRegisterEui();
  const createSensorConfig = useCreateSensorConfig();
  const createDataloggerConfig = useCreateDataloggerConfig();
  const deactivateSensorConfig = useDeactivateSensorConfig();
  const { mutateAsync: createFirmwareEntry } = useCreateFirmwareEntry();
  const { mutate: createDeviceLog } = useCreateDeviceLog();
  /** `undefined` until read this connection; `null` on firmware without a start-up log. */
  const [startupReport, setStartupReport] = useState<StartupReport | null | undefined>(undefined);
  /** Device log lines sent this session, so a repeated failure is logged once. */
  const logged = useRef(new Map<string, number>());
  const [resetNotice, setResetNotice] = useState<ResetNotice | null>(null);
  /** When `datalogger reset` was sent; its settings sync waits for a later connection. */
  const [resetRequestedAt, setResetRequestedAt] = useState<number | null>(null);
  const [firmwareRecord, setFirmwareRecord] = useState<FirmwareRecord | null>(null);

  const { mutateAsync: bindDevice } = bind;
  // Every connection (including an automatic reconnect after a crash) gets a
  // fresh ownership check: cached answers from before it don't count.
  const { connectedAt } = serial;
  const fresh = deviceQuery.dataUpdatedAt >= connectedAt;
  const { refetch: refetchDevice } = deviceQuery;
  useEffect(() => {
    if (!serialNumber || !connectedAt) return;
    setClaim(null);
    void refetchDevice();
  }, [serialNumber, connectedAt, refetchDevice]);

  const notFound = fresh && deviceQuery.isSuccess && deviceQuery.data.length === 0;

  // `rrivctl connect`: a board that isn't on the account yet is bound straight
  // away. Bind succeeds for an unowned board and 409s for someone else's, so
  // this is also the ownership check that gates the board tools.
  useEffect(() => {
    if (!serialNumber || !notFound || claim?.serial === serialNumber) return;
    setClaim({ serial: serialNumber, status: "pending" });
    bindDevice(serialNumber)
      .then((bound) => {
        setFreshlyBound(serialNumber);
        setClaim({ serial: serialNumber, status: "bound", device: bound });
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 409) {
          setClaim({ serial: serialNumber, status: "foreign" });
        } else if (cause instanceof ApiError && cause.status === 422) {
          setClaim({ serial: serialNumber, status: "unregistered" });
        } else {
          setClaim({ serial: serialNumber, status: "error", error: bindErrorMessage(cause) });
        }
      });
  }, [serialNumber, notFound, claim?.serial, bindDevice]);

  const claimed = claim?.serial === serialNumber ? claim : null;
  // The bind response stands in until the device list catches up (the
  // authorization tuples that scope `GET /device` sync asynchronously).
  const device: Device | null =
    deviceQuery.data?.[0] ?? (claimed?.status === "bound" ? claimed.device : null);
  const placement = device?.DeviceContext?.[0] ?? null;

  const stage: SetupStage = (() => {
    // Nothing counts until the connection is live (e.g. while a crashed board
    // reboots, the cached serial number and device lookup are from before).
    if (!serial.info || serial.status !== "connected") return "reading";
    if (!serialNumber) {
      if (me.isPending) return "checking";
      return me.data?.isProvisioner ? "unprovisioned" : "needs-provisioner";
    }
    if (claimed?.status === "foreign" || claimed?.status === "unregistered") {
      return claimed.status;
    }
    if (claimed?.status === "error" || deviceQuery.isError) return "cloud-error";
    if (deviceQuery.isPending || !fresh || !device) return "checking";
    return placement ? "ready" : "no-context";
  })();

  const owned = stage === "ready" || stage === "no-context";
  const cloudError =
    claimed?.status === "error"
      ? claimed.error
      : deviceQuery.error instanceof Error
        ? deviceQuery.error.message
        : null;

  // Only once the board is confirmed ours: read its details, then set the
  // clock like `rrivctl connect`.
  // (The identity was read on connect; only the details are needed here.)
  const { detailsRead, refreshDetails, syncClock, client: liveClient } = serial;
  useEffect(() => {
    if (!owned || !liveClient || detailsRead) return;
    void refreshDetails()
      .then(() => syncClock())
      .catch(() => undefined);
  }, [owned, liveClient, detailsRead, refreshDetails, syncClock]);

  // The start-up log, once per connection after the details are read.
  useEffect(() => {
    setStartupReport(undefined);
  }, [connectedAt]);
  useEffect(() => {
    if (!owned || !liveClient || !detailsRead || startupReport !== undefined) return;
    let current = true;
    readStartupReport(liveClient)
      .then((report) => current && setStartupReport(report))
      .catch(() => current && setStartupReport(null));
    return () => {
      current = false;
    };
  }, [owned, liveClient, detailsRead, startupReport]);

  /**
   * Note something in the device's log in RRIV (for support), at most once an
   * hour per message. Only for a board confirmed as the user's.
   */
  const logToDevice = useCallback(
    (identifier: string, line: string) => {
      const sent = logged.current;
      const last = sent.get(line);
      if (last !== undefined && Date.now() - last < 60 * 60 * 1000) return;
      sent.set(line, Date.now());
      createDeviceLog({ identifier, log: line }, { onError: () => sent.delete(line) });
    },
    [createDeviceLog],
  );

  useEffect(() => {
    if (!startupReport || startupReport.previousCompleted || !serialNumber || !owned) return;
    const runs = startupReport.failedStartups + 1;
    logToDevice(
      serialNumber,
      `web: start-up stopped at ${startupReport.stoppedAt ?? "unknown"} (${startupReport.resetCause}), ${runs} unfinished in a row`,
    );
  }, [startupReport, serialNumber, owned, logToDevice]);

  // Connection failures on a board known to be the user's.
  const ownedSerial = useRef<string | null>(null);
  if (owned && serialNumber) ownedSerial.current = serialNumber;
  const { status: connectionStatus, error: connectionError } = serial;
  useEffect(() => {
    const known = ownedSerial.current;
    if (connectionStatus !== "error" || !connectionError || !known) return;
    logToDevice(known, `web: connect failed: ${connectionError}`);
  }, [connectionStatus, connectionError, logToDevice]);

  const retry = () => {
    setClaim(null);
    void deviceQuery.refetch();
    void me.refetch();
  };

  const target: Placement | null =
    device && placement ? { deviceId: device.id, contextId: placement.Context.id } : null;

  const notLinked: SyncOutcome = {
    kind: "skipped",
    reason: "Link this board to a context to sync config to the cloud.",
  };

  /**
   * Upload what the board reports for a sensor. `source` is the library
   * version it was just applied from (`null`: applied from something that
   * isn't a library version, which clears it); leave it out for hand edits.
   */
  const syncSensor = async (
    applied: SerialRecord,
    to: Placement | null = target,
    source?: ConfigSource | null,
    /** The driver to record it with (a library version's); defaults to the first. */
    driverId?: string,
  ): Promise<SyncOutcome> => {
      if (!to) return notLinked;
      try {
        const drivers = sensorDrivers.data ?? (await sensorDrivers.refetch()).data;
        const driver = driverId ? { id: driverId } : pickDriver(drivers);
        if (!driver) return { kind: "failed", error: "No sensor drivers found; contact an admin." };
        await createSensorConfig.mutateAsync({
          ...sensorConfigUpload(applied, { ...to, driverId: driver.id }),
          ...(source !== undefined && { source }),
        });
        return { kind: "synced" };
      } catch (cause) {
        return { kind: "failed", error: errorText(cause) };
      }
  };

  /** A sensor was removed from the board: end its config in the cloud. */
  const syncSensorRemoval = async (
    id: string,
    to: Placement | null = target,
  ): Promise<SyncOutcome> => {
    if (!to) return notLinked;
    try {
      await deactivateSensorConfig.mutateAsync({ name: id, ...to });
      return { kind: "synced" };
    } catch (cause) {
      return { kind: "failed", error: errorText(cause) };
    }
  };

  const syncDatalogger = async (
    applied: SerialRecord,
    to: Placement | null = target,
    source?: ConfigSource | null,
    /** The driver to record it with (a library version's); defaults to the first. */
    driverId?: string,
  ): Promise<SyncOutcome> => {
      if (!to) return notLinked;
      try {
        const drivers = dataloggerDrivers.data ?? (await dataloggerDrivers.refetch()).data;
        const driver = driverId ? { id: driverId } : pickDriver(drivers);
        if (!driver) {
          return { kind: "failed", error: "No datalogger drivers found; contact an admin." };
        }
        await createDataloggerConfig.mutateAsync({
          ...dataloggerConfigUpload(applied, { ...to, driverId: driver.id }),
          ...(source !== undefined && { source }),
        });
        return { kind: "synced" };
      } catch (cause) {
        return { kind: "failed", error: errorText(cause) };
      }
  };

  // A web install is recorded once the board is back in the app and confirmed
  // as the user's, against the context it's placed in.
  const installed = serial.firmware?.stage === "done" ? serial.firmware : null;
  const deviceId = target?.deviceId;
  const contextId = target?.contextId;
  const recordFirmware = useCallback(async () => {
    if (!installed) return;
    const { version, installedAt } = installed;
    if (!deviceId || !contextId) {
      setFirmwareRecord({ installedAt, outcome: notLinkedFirmware });
      return;
    }
    setFirmwareRecord({ installedAt, outcome: null });
    try {
      await createFirmwareEntry({ deviceId, contextId, version, installedAt });
      setFirmwareRecord({ installedAt, outcome: { kind: "synced" } });
    } catch (cause) {
      setFirmwareRecord({ installedAt, outcome: { kind: "failed", error: errorText(cause) } });
    }
  }, [installed, deviceId, contextId, createFirmwareEntry]);

  // Wait while ownership is still being checked (or the check failed and may be retried).
  const settled = !["reading", "checking", "cloud-error"].includes(stage);
  useEffect(() => {
    if (!installed || !settled || firmwareRecord?.installedAt === installed.installedAt) return;
    if (stage === "ready" || stage === "no-context") {
      void recordFirmware();
    } else {
      // Reachable through update mode, whose recovery install doesn't check
      // ownership (the bootloader can't say which board it is).
      setFirmwareRecord({
        installedAt: installed.installedAt,
        outcome: { kind: "skipped", reason: "This board isn't on your account, so the install isn't recorded." },
      });
    }
  }, [installed, settled, stage, firmwareRecord?.installedAt, recordFirmware]);

  const firmwareHistory =
    installed && firmwareRecord?.installedAt === installed.installedAt
      ? { ...firmwareRecord, retry: recordFirmware }
      : null;

  /**
   * `datalogger reset`: default settings and no sensors. The board restarts;
   * once it's back, its (default) settings are recorded in the cloud.
   */
  const resetDatalogger = async () => {
    await serial.sendRestarting(
      DATALOGGER_RESET,
      "Resetting the datalogger settings to their defaults. The board restarts and reconnects automatically.",
    );
    setResetRequestedAt(Date.now());
    setResetNotice({ kind: "datalogger", outcome: null });
  };

  const { datalogger: boardSettings } = serial;
  useEffect(() => {
    if (resetRequestedAt === null || connectedAt <= resetRequestedAt) return;
    if (!owned || !detailsRead || !boardSettings) return;
    setResetRequestedAt(null);
    void syncDatalogger(boardSettings).then((outcome) =>
      setResetNotice({ kind: "datalogger", outcome }),
    );
    // syncDatalogger is rebuilt every render, so it isn't a dependency; the
    // reset clears resetRequestedAt above, so this runs once per reset.
  }, [resetRequestedAt, connectedAt, owned, detailsRead, boardSettings]);

  /** Provisioners can wipe a board they own back to unprovisioned. */
  const canFactoryReset = Boolean(me.data?.isProvisioner) && owned && Boolean(serialNumber);

  /**
   * `device reset`: blank serial number, default settings, no sensors. The
   * device stays in rriv-api, bound as before, so provisioning the board again
   * gives back the same serial number and it's back on the account.
   */
  const factoryReset = async () => {
    if (!canFactoryReset || !serialNumber) throw new Error("Only a provisioner can factory-reset a board they own.");
    const wiped = serialNumber;
    await serial.sendRestarting(
      deviceReset(wiped),
      "Factory reset: the board restarts without a serial number and needs provisioning again.",
    );
    setResetNotice({ kind: "factory", serialNumber: wiped });
  };

  const retryResetSync = async () => {
    if (resetNotice?.kind === "datalogger" && boardSettings) {
      setResetNotice({ kind: "datalogger", outcome: null });
      setResetNotice({ kind: "datalogger", outcome: await syncDatalogger(boardSettings) });
    }
  };

  const dismissResetNotice = () => setResetNotice(null);

  /** `rrivctl provision device --skip`: create the cloud record, write the serial number. */
  const provision = async () => {
    const client = serial.client;
    const uid = serial.info?.uid ?? "";
    if (!client) throw new Error("Connect to a board first.");
    if (!isValidUid(uid)) {
      throw new Error(
        `The board reported an invalid uid (${uid || "none"}). Press reset on the board and reconnect.`,
      );
    }
    const created = await provisionDevice.mutateAsync(uid);
    await setSerialNumber(client, created.serialNumber);
    await serial.refreshIdentity();
    return created;
  };

  /**
   * Place the (already bound) board in a context. For a board bound in this
   * session, then upload its datalogger config like `rrivctl connect`'s
   * `pullConfig`. Resolves with that upload's outcome, or `null`.
   */
  const assignContext = async (contextId: string) => {
    if (!device) throw new Error("The board isn't on your account yet.");
    await createDeviceContext.mutateAsync({
      contextId,
      deviceId: device.id,
      assignedDeviceName: device.uniqueName,
    });
    let pulled: SyncOutcome | null = null;
    if (freshlyBound === serialNumber) {
      const client = serial.client;
      pulled = { kind: "skipped", reason: "Board disconnected." };
      if (client) {
        try {
          const settings = await getDatalogger(client);
          pulled = await syncDatalogger(settings, { deviceId: device.id, contextId });
        } catch (cause) {
          pulled = { kind: "failed", error: errorText(cause) };
        }
      }
      setFreshlyBound(null);
    }
    await deviceQuery.refetch();
    return { device, pulled };
  };

  /**
   * `rrivctl provision telemeter`: ask the board for its EUIs only now, when
   * the user registers, then register them. Fails with what the board said.
   */
  const registerTelemeter = async (application?: string) => {
    if (!device) throw new Error("Link the board first.");
    const client = serial.client;
    if (!client) throw new Error("Connect to a board first.");
    let telemeter;
    try {
      telemeter = await readTelemeter(client);
    } catch (cause) {
      if (cause instanceof SerialTimeoutError) {
        throw new Error('The board didn\'t reply to "telemeter get", so it reported no EUIs.');
      }
      throw cause;
    }
    const { devEui, joinEui } = telemeter;
    if (!devEui || !joinEui) {
      const reply = telemeter.message ?? JSON.stringify(telemeter.raw);
      throw new Error(`The board didn't report its EUIs. It replied: ${reply}`);
    }
    await registerEui.mutateAsync({
      deviceId: device.id,
      eui: devEui,
      joinEui,
      ...(application ? { application } : {}),
    });
    return { devEui, joinEui };
  };

  return {
    stage,
    device,
    placement,
    deviceQuery,
    sensorDrivers,
    dataloggerDrivers,
    syncSensor,
    syncSensorRemoval,
    syncDatalogger,
    owned,
    cloudError,
    retry,
    provision,
    assignContext,
    registerTelemeter,
    firmwareHistory,
    startupReport,
    resetDatalogger,
    canFactoryReset,
    factoryReset,
    resetNotice,
    retryResetSync,
    dismissResetNotice,
  };
}

export type BoardLink = ReturnType<typeof useBoardLink>;
