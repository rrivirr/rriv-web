import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DeviceInfo,
  MAX_WATCH_FRAMES,
  RRIV_USB_FILTER,
  SerialClient,
  type SerialPort,
  SerialTimeoutError,
  type SerialRecord,
  type WatchFrame,
  type WatchSink,
  WebSerialTransport,
  describePort,
  getDatalogger,
  getWebSerial,
  isWebSerialSupported,
  parseBoardStatus,
  readBoardVersion,
  readDevice,
  setClock,
} from ".";

/**
 * - `lost`: the board went away (unplugged or re-enumerated after a reboot)
 *   without the user disconnecting.
 */
export type SerialStatus = "idle" | "connecting" | "connected" | "lost" | "error";

export interface PortOption {
  port: SerialPort;
  label: string;
}

export interface TranscriptEntry {
  id: number;
  at: string;
  direction: "tx" | "rx";
  text: string;
}

/**
 * The board restarted while connected: after a crash (the panic handler hangs
 * until the watchdog resets it) or on its own (`datalogger-ready` out of the
 * blue). Either way, what the page read from it is stale.
 */
export type RestartNotice =
  | { kind: "crash"; message: string; at: string }
  | { kind: "restart"; at: string };

/** How long to wait for `datalogger-ready` after the board reappears (rrivctl: 7s + 13s). */
const BOOT_WAIT_MS = 15_000;
/** A crash this recent explains a dropped connection. */
const CRASH_WINDOW_MS = 60_000;

const isReadyLine = (line: string) => parseBoardStatus(line)?.kind === "ready";

const crashText = (message: string) =>
  `The board crashed${message ? ` (${message})` : ""} and is restarting. It will reconnect automatically.`;

/** Keep only the most recent transcript lines so it can never grow unbounded. */
const MAX_TRANSCRIPT = 500;
/** Batch high-rate serial updates into one render per interval. */
const FLUSH_MS = 100;

export interface StartWatchOptions {
  debug?: boolean;
  /** Persist every frame here as it arrives (e.g. a file on disk). */
  sink?: WatchSink | null;
}

export interface SerialConnection {
  supported: boolean;
  ports: PortOption[];
  /** The port of the current (or last lost) connection. */
  activePort: SerialPort | null;
  status: SerialStatus;
  error: string | null;
  info: DeviceInfo | null;
  boardVersion: string | null;
  /** Last datalogger settings read from the board (includes `mode`). */
  datalogger: SerialRecord | null;
  /** When the board clock was last set from this browser. */
  clockSetAt: string | null;
  /** When the current connection started (ms since epoch), 0 if never. */
  connectedAt: number;
  /** True while waiting for a reappearing board to finish booting. */
  waitingForBoot: boolean;
  /** The board crashed or restarted during this session. */
  restart: RestartNotice | null;
  dismissRestart: () => void;
  transcript: TranscriptEntry[];
  /** True while the board is streaming `watch` frames. */
  watching: boolean;
  /** Most recent frames since the current watch started (capped). */
  frames: WatchFrame[];
  /** All frames received this watch, including ones dropped from memory. */
  frameCount: number;
  /** Name of the file frames are being written to, if any. */
  sinkName: string | null;
  /** The live client, or `null` while disconnected. */
  client: SerialClient | null;
  /** Open the browser's port picker (RRIV boards only) and connect. */
  connectNew: () => Promise<void>;
  connect: (port: SerialPort) => Promise<void>;
  reconnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** True once firmware and datalogger settings have been read this connection. */
  detailsRead: boolean;
  /** Re-read only the serial number and uid. */
  refreshIdentity: () => Promise<void>;
  /** Read firmware and datalogger settings (not the identity the connection already has). */
  refreshDetails: () => Promise<void>;
  /** Re-read identity plus firmware and datalogger settings. */
  refreshInfo: () => Promise<void>;
  /** Re-read just the datalogger settings. */
  refreshDatalogger: () => Promise<SerialRecord | null>;
  syncClock: () => Promise<void>;
  startWatch: (options?: StartWatchOptions) => Promise<void>;
  stopWatch: () => Promise<void>;
  clearFrames: () => void;
  clearTranscript: () => void;
}

const message = (cause: unknown, fallback: string) =>
  cause instanceof Error && cause.message ? cause.message : fallback;

const isJsonLine = (line: string) => line.trimStart().startsWith("{");

/**
 * Owns the Web Serial connection: port permissions, the transport/client
 * lifecycle, what was read from the board, the serial transcript, and the
 * live `watch` stream. Only one tab can hold a port; the browser remembers
 * granted ports via `navigator.serial.getPorts()`.
 */
export function useSerialConnection(): SerialConnection {
  const supported = isWebSerialSupported();
  const [ports, setPorts] = useState<PortOption[]>([]);
  const [activePort, setActivePort] = useState<SerialPort | null>(null);
  const [status, setStatus] = useState<SerialStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [boardVersion, setBoardVersion] = useState<string | null>(null);
  const [datalogger, setDatalogger] = useState<SerialRecord | null>(null);
  const [clockSetAt, setClockSetAt] = useState<string | null>(null);
  const [detailsRead, setDetailsRead] = useState(false);
  const [connectedAt, setConnectedAt] = useState(0);
  const [waitingForBoot, setWaitingForBoot] = useState(false);
  const [restart, setRestart] = useState<RestartNotice | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [watching, setWatching] = useState(false);
  const [frames, setFrames] = useState<WatchFrame[]>([]);
  const [frameCount, setFrameCount] = useState(0);
  const [sinkName, setSinkName] = useState<string | null>(null);
  const [client, setClient] = useState<SerialClient | null>(null);

  const clientRef = useRef<SerialClient | null>(null);
  const statusRef = useRef<SerialStatus>("idle");
  const activePortRef = useRef<SerialPort | null>(null);
  const watchingRef = useRef(false);
  const sinkRef = useRef<WatchSink | null>(null);
  const pendingFrames = useRef<WatchFrame[]>([]);
  const pendingTranscript = useRef<TranscriptEntry[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextEntryId = useRef(0);
  const crashRef = useRef<{ message: string; at: number } | null>(null);

  const updateStatus = useCallback((next: SerialStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const flush = useCallback(() => {
    flushTimer.current = null;
    const newFrames = pendingFrames.current;
    const newEntries = pendingTranscript.current;
    pendingFrames.current = [];
    pendingTranscript.current = [];
    if (newFrames.length) {
      setFrames((prev) => [...prev, ...newFrames].slice(-MAX_WATCH_FRAMES));
      setFrameCount((count) => count + newFrames.length);
    }
    if (newEntries.length) {
      setTranscript((prev) => [...prev, ...newEntries].slice(-MAX_TRANSCRIPT));
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (!flushTimer.current) flushTimer.current = setTimeout(flush, FLUSH_MS);
  }, [flush]);

  const record = useCallback(
    (direction: TranscriptEntry["direction"], text: string) => {
      pendingTranscript.current.push({
        id: nextEntryId.current++,
        at: new Date().toISOString(),
        direction,
        text,
      });
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const refreshPorts = useCallback(async () => {
    const serial = getWebSerial();
    if (!serial) return;
    const granted = await serial.getPorts();
    setPorts(granted.map((port, index) => ({ port, label: describePort(port, index) })));
  }, []);

  const closeSink = useCallback(async () => {
    const sink = sinkRef.current;
    sinkRef.current = null;
    setSinkName(null);
    await sink?.close().catch(() => undefined);
  }, []);

  /** Forget the live client without touching what was read from the board. */
  const dropClient = useCallback(() => {
    clientRef.current = null;
    setClient(null);
    watchingRef.current = false;
    setWatching(false);
    void closeSink();
  }, [closeSink]);

  const refreshDatalogger = useCallback(async () => {
    const active = clientRef.current;
    if (!active) return null;
    const settings = await getDatalogger(active);
    setDatalogger(settings);
    return settings;
  }, []);

  /** Just the serial number and uid: what's needed to check ownership. */
  const refreshIdentity = useCallback(async () => {
    const active = clientRef.current;
    if (!active) return;
    setInfo(await readDevice(active));
  }, []);

  /**
   * Firmware version and datalogger settings, without re-reading the identity
   * the connection already has. The telemeter is not read here: its EUIs are
   * only asked for when the user registers them.
   */
  const refreshDetails = useCallback(async () => {
    const active = clientRef.current;
    if (!active) return;
    setBoardVersion(await readBoardVersion(active).catch(() => null));
    // Best-effort: a failure here should not block the rest of the page.
    await refreshDatalogger().catch(() => setDatalogger(null));
    setDetailsRead(true);
  }, [refreshDatalogger]);

  /** Everything: identity plus details (the user's explicit Refresh). */
  const refreshInfo = useCallback(async () => {
    await refreshIdentity();
    await refreshDetails();
  }, [refreshDetails, refreshIdentity]);

  const syncClock = useCallback(async () => {
    const active = clientRef.current;
    if (!active) throw new Error("Connect to a board first.");
    await setClock(active);
    setClockSetAt(new Date().toISOString());
  }, []);

  /** The board said `datalogger-ready` mid-session: it restarted, so re-read it. */
  const onBoardRestarted = useCallback(() => {
    if (watchingRef.current) {
      // Restarting ends watch mode on the board.
      watchingRef.current = false;
      setWatching(false);
      flush();
      void closeSink();
    }
    setDetailsRead(false);
    setClockSetAt(null);
    setDatalogger(null);
    setRestart((current) =>
      current?.kind === "crash" ? current : { kind: "restart", at: new Date().toISOString() },
    );
  }, [closeSink, flush]);

  const recentCrash = useCallback(() => {
    const crash = crashRef.current;
    return crash && Date.now() - crash.at < CRASH_WINDOW_MS ? crash : null;
  }, []);

  /**
   * Open `port` and read the board's identity. `afterLoss` marks a board that
   * reappeared (reboot, crash or replug): if it doesn't answer straight away,
   * wait for `datalogger-ready` before trying again, like rrivctl's
   * `waitForReady`.
   */
  const openPort = useCallback(
    async (port: SerialPort, afterLoss: boolean) => {
      if (clientRef.current) await clientRef.current.stop().catch(() => undefined);
      dropClient();
      updateStatus("connecting");
      setConnectedAt(Date.now());
      setError(null);
      setFrames([]);
      setFrameCount(0);
      setClockSetAt(null);
      setDetailsRead(false);
      setBoardVersion(null);
      setDatalogger(null);
      activePortRef.current = port;
      setActivePort(port);

      const transport = new WebSerialTransport(port, describePort(port));
      let nextClient: SerialClient | null = null;
      try {
        await transport.open();
        nextClient = new SerialClient(transport, {
          onWrite: (line) => record("tx", line),
          onLine: (line) => {
            const boardStatus = parseBoardStatus(line);
            if (boardStatus?.kind === "panic") {
              crashRef.current = { message: boardStatus.message, at: Date.now() };
              setRestart({
                kind: "crash",
                message: boardStatus.message,
                at: new Date().toISOString(),
              });
            } else if (boardStatus?.kind === "ready" && statusRef.current === "connected") {
              onBoardRestarted();
            }
            const frame = watchingRef.current && !isJsonLine(line);
            if (!frame) {
              if (line.trim()) record("rx", line);
              return;
            }
            const entry = { receivedAt: new Date().toISOString(), raw: line };
            pendingFrames.current.push(entry);
            void sinkRef.current?.write(entry).catch(() => undefined);
            scheduleFlush();
          },
        });
        const started = nextClient;
        started.start();
        clientRef.current = started;
        setClient(started);
        void started.closed.then(() => {
          // Only an unexpected close counts as lost; disconnect() clears the ref first.
          if (clientRef.current !== started) return;
          dropClient();
          updateStatus("lost");
          const crash = recentCrash();
          setError(
            crash
              ? crashText(crash.message)
              : "The board disconnected. Plug it back in to reconnect.",
          );
        });

        // Only the identity is read here. Details and the clock wait until the
        // caller confirms the board is the user's (see useBoardLink).
        if (afterLoss) {
          // Listen from the start so a `datalogger-ready` sent while the first
          // read is in flight isn't missed.
          const booted = started.waitForLine(isReadyLine, BOOT_WAIT_MS);
          const waitForBoot = async () => {
            setWaitingForBoot(true);
            try {
              await booted;
            } finally {
              setWaitingForBoot(false);
            }
          };
          // After a crash the board is certainly rebooting: don't talk over it.
          if (recentCrash()) await waitForBoot();
          try {
            await refreshIdentity();
          } catch (cause) {
            if (!(cause instanceof SerialTimeoutError)) throw cause;
            await waitForBoot();
            await refreshIdentity();
          }
        } else {
          await refreshIdentity();
        }
        crashRef.current = null;
        updateStatus("connected");
        void refreshPorts();
      } catch (cause) {
        clientRef.current = null;
        setClient(null);
        if (nextClient) await nextClient.stop().catch(() => undefined);
        else await transport.close().catch(() => undefined);
        updateStatus("error");
        setError(
          message(
            cause,
            "Could not open the serial port. Is it open in another tab or app?",
          ),
        );
      }
    },
    [
      dropClient,
      onBoardRestarted,
      recentCrash,
      record,
      refreshIdentity,
      refreshPorts,
      scheduleFlush,
      updateStatus,
    ],
  );

  /** A user-initiated connection: starts a fresh session. */
  const connect = useCallback(
    async (port: SerialPort) => {
      crashRef.current = null;
      setRestart(null);
      await openPort(port, false);
    },
    [openPort],
  );

  const connectNew = useCallback(async () => {
    const serial = getWebSerial();
    if (!serial) throw new Error("Web Serial is not available in this browser.");
    let port: SerialPort;
    try {
      port = await serial.requestPort({ filters: [RRIV_USB_FILTER] });
    } catch (cause) {
      // The user dismissed the picker.
      if (cause instanceof DOMException && cause.name === "NotFoundError") return;
      throw cause;
    }
    await refreshPorts();
    await connect(port);
  }, [openPort, refreshPorts]);

  const reconnect = useCallback(async () => {
    const port = activePortRef.current;
    if (port) await openPort(port, true);
  }, [openPort]);

  const dismissRestart = useCallback(() => setRestart(null), []);

  const disconnect = useCallback(async () => {
    const active = clientRef.current;
    dropClient();
    if (active) await active.stop().catch(() => undefined);
    activePortRef.current = null;
    setActivePort(null);
    updateStatus("idle");
    setError(null);
    setInfo(null);
    setBoardVersion(null);
    setDatalogger(null);
    setClockSetAt(null);
    setDetailsRead(false);
    setWaitingForBoot(false);
    setRestart(null);
    crashRef.current = null;
  }, [dropClient, updateStatus]);

  const startWatch = useCallback(
    async ({ debug = false, sink = null }: StartWatchOptions = {}) => {
      const active = clientRef.current;
      if (!active) throw new Error("Connect to a board first.");
      await closeSink();
      pendingFrames.current = [];
      setFrames([]);
      setFrameCount(0);
      sinkRef.current = sink;
      setSinkName(sink?.name ?? null);
      await active.write({
        object: "datalogger",
        action: "set",
        mode: debug ? "watch-debug" : "watch",
      });
      watchingRef.current = true;
      setWatching(true);
    },
    [closeSink],
  );

  const stopWatch = useCallback(async () => {
    watchingRef.current = false;
    setWatching(false);
    flush();
    await closeSink();
    const active = clientRef.current;
    if (active) {
      // Leave the board usable for config/discovery commands again.
      await active
        .write({ object: "datalogger", action: "set", mode: "interactive" })
        .catch(() => undefined);
    }
  }, [closeSink, flush]);

  const clearFrames = useCallback(() => {
    pendingFrames.current = [];
    setFrames([]);
    setFrameCount(0);
  }, []);

  const clearTranscript = useCallback(() => {
    pendingTranscript.current = [];
    setTranscript([]);
  }, []);

  // Track plug/unplug: keep the granted-port list fresh, and pick a lost
  // board back up when it re-appears (e.g. after a reboot).
  useEffect(() => {
    const serial = getWebSerial();
    if (!serial) return;
    void refreshPorts();
    const onConnect = (event: Event) => {
      void refreshPorts();
      const port = (event.target ?? null) as SerialPort | null;
      if (statusRef.current === "lost" && port) void openPort(port, true);
    };
    const onDisconnect = () => void refreshPorts();
    serial.addEventListener?.("connect", onConnect);
    serial.addEventListener?.("disconnect", onDisconnect);
    return () => {
      serial.removeEventListener?.("connect", onConnect);
      serial.removeEventListener?.("disconnect", onDisconnect);
    };
  }, [connect, refreshPorts]);

  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
      const active = clientRef.current;
      clientRef.current = null;
      void active?.stop().catch(() => undefined);
      void sinkRef.current?.close().catch(() => undefined);
    },
    [],
  );

  return {
    supported,
    ports,
    activePort,
    status,
    error,
    info,
    boardVersion,
    datalogger,
    clockSetAt,
    connectedAt,
    waitingForBoot,
    restart,
    dismissRestart,
    transcript,
    watching,
    frames,
    frameCount,
    sinkName,
    client,
    connectNew,
    connect,
    reconnect,
    disconnect,
    detailsRead,
    refreshIdentity,
    refreshDetails,
    refreshInfo,
    refreshDatalogger,
    syncClock,
    startWatch,
    stopWatch,
    clearFrames,
    clearTranscript,
  };
}
