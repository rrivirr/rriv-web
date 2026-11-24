import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Device, LibraryConfigDetail } from "@/api/types";
import { DeviceConnectionPage } from "@/pages/DeviceConnectionPage";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";
import {
  boardPort,
  bootloaderBoard,
  installSerial,
  signedImage,
  uninstallSerial,
} from "../serial/fakeBoard";

const API = "http://api.test";
const UID = "0123456789ABCDEF01234567";

const device: Device = {
  id: "d1",
  serialNumber: "SN-1",
  uniqueName: "logger-a",
  createdAt: "2026-01-01T00:00:00Z",
  DeviceContext: [{ assignedDeviceName: "upstream", Context: { id: "c1", name: "well-a" } }],
  DeviceEuis: [],
};

const context = {
  id: "c1",
  name: "well-a",
  startedAt: "2026-01-01T00:00:00Z",
  endedAt: null,
};

type Command = Record<string, unknown>;

/**
 * Names `DataloggerSetPayload` reads. `bursts_per_cycle` sets the reported
 * `bursts_per_measurement_cycle`; anything else (e.g. `deployment_timestamp`,
 * `delay_between_bursts`) is silently ignored, as serde does.
 */
const SETTABLE_DATALOGGER = [
  "site_name",
  "logger_name",
  "deployment_identifier",
  "sleep_interval",
  "interactive_logging_interval",
  "start_up_delay",
  "mode",
  "interactive_logging",
  "enable_lorawan_telemetry",
  "enable_modbus_rtu",
  "enable_sdi12",
  "lock_mode",
];

/** A stateful simulated board, close enough to the firmware's replies. */
function makeBoard(initial: { serialNumber?: string } = {}) {
  const state = {
    serialNumber: initial.serialNumber ?? "SN-1",
    datalogger: {
      site_name: "SITE-A",
      logger_name: "L1",
      sleep_interval: 15,
      bursts_per_measurement_cycle: 1,
      delay_between_bursts: 0,
      mode: "interactive",
    } as Command,
    sensors: new Map<string, Command>([["temp01", { id: "temp01", type: "ds18b20", wait_time: 5 }]]),
    /** Crash on the next command: panic, then drop off USB like the watchdog reset. */
    crashNext: false,
    /** `board get startup`; `null` answers like firmware without a start-up log. */
    startup: null as Command | null,
    /** Commands to answer with an error, as the firmware does for a value it rejects. */
    refuse: null as ((command: Command) => boolean) | null,
  };
  const respond = (command: Command): Command | string | null => {
    const { object, action, id } = command;
    if (state.crashNext) {
      state.crashNext = false;
      setTimeout(() => board.unplug(), 20);
      return '{"status":"panic","message":"heap exhausted"}';
    }
    if (state.refuse?.(command)) {
      return { status: "error", message: "sensor type not found", error: "" };
    }
    if (object === "device" && action === "get") {
      return { serial_number: state.serialNumber, uid: UID, codes: [] };
    }
    if (object === "device" && action === "set") {
      state.serialNumber = String(command.serial_number);
      return { message: "ok" };
    }
    if (object === "board" && action === "get" && command.parameter === "startup" && state.startup) {
      return { startup: state.startup };
    }
    if (object === "board" && action === "get") return { message: JSON.stringify({ fv: "9.9.9" }) };
    if (object === "datalogger" && action === "reset") {
      setTimeout(() => board.unplug(), 20);
      return { message: "datalogger reset, restarting" };
    }
    if (object === "device" && action === "reset") {
      if (command.serial_number !== state.serialNumber) {
        return { status: "error", message: "serial_number must be this board's serial number", error: "" };
      }
      setTimeout(() => board.unplug(), 20);
      return { message: "device reset, restarting" };
    }
    if (object === "board" && action === "set") return { message: "Epoch set" };
    if (object === "telemeter") return { dev_eui: "DEVEUI1", join_eui: "JOINEUI1" };
    if (object === "datalogger" && action === "get") return state.datalogger;
    if (object === "datalogger" && action === "set") {
      const { object: _o, action: _a, ...props } = command;
      // `watch` modes stream instead of replying.
      if (String(props.mode).startsWith("watch")) return null;
      for (const [key, value] of Object.entries(props)) {
        if (key === "bursts_per_cycle") state.datalogger.bursts_per_measurement_cycle = value;
        else if (SETTABLE_DATALOGGER.includes(key)) state.datalogger[key] = value;
      }
      return state.datalogger;
    }
    if (object === "sensor" && action === "list") {
      return { sensors: [...state.sensors.values()].map(({ id: sid, type }) => ({ id: sid, type })) };
    }
    if (object === "sensor" && action === "get") {
      return state.sensors.get(String(id)) ?? { message: "didn't find the sensor" };
    }
    if (object === "sensor" && action === "set") {
      const existing = state.sensors.get(String(id));
      if (existing && command.type) {
        return { status: "error", message: "sensor type cannot be specified when updating", error: "" };
      }
      const { object: _o, action: _a, ...props } = command;
      const next = { ...(existing ?? {}), ...props };
      state.sensors.set(String(id), next);
      return next;
    }
    if (object === "sensor" && action === "remove") {
      state.sensors.delete(String(id));
      return { message: "sensor removed" };
    }
    return { message: "ok" };
  };
  const board = boardPort(respond);
  return { ...board, state };
}

const me = (isProvisioner = false) => ({
  id: "a1",
  email: "me@test.local",
  firstName: "M",
  lastName: "E",
  isAdmin: false,
  isProvisioner,
});

const unplaced: Device = { ...device, DeviceContext: [] };

const isEpoch = (command: Record<string, unknown>) =>
  command.object === "board" && command.action === "set" && typeof command.epoch === "number";

const commonHandlers = (options: { provisioner?: boolean } = {}) => [
  http.get(`${API}/account/me`, () => HttpResponse.json(me(options.provisioner))),
  http.get(`${API}/firmware/releases`, () => HttpResponse.json([])),
  http.get(`${API}/context`, () => HttpResponse.json([context])),
  http.get(`${API}/sensor/driver`, () => HttpResponse.json([{ id: "sd1", name: "generic" }])),
  http.get(`${API}/datalogger/driver`, () =>
    HttpResponse.json([{ id: "dd1", name: "rriv_datalogger" }]),
  ),
];

async function connect(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Connect board" }));
  expect(await screen.findByRole("button", { name: "Disconnect" })).toBeInTheDocument();
}

/** Connect a linked board and open the Datalogger tab; returns the cloud-sync spy. */
async function openDatalogger(board: ReturnType<typeof makeBoard>) {
  installSerial([], board.port);
  const user = userEvent.setup();
  const synced = vi.fn();
  server.use(
    ...commonHandlers(),
    http.get(`${API}/device`, () => HttpResponse.json([device])),
    http.post(`${API}/datalogger/config`, async ({ request }) => {
      synced(await request.json());
      return new HttpResponse(null, { status: 201 });
    }),
  );
  renderWithProviders(<DeviceConnectionPage />);
  await connect(user);
  await user.click(await screen.findByRole("tab", { name: "Datalogger" }));
  await screen.findByLabelText(/Site name/);
  return { user, synced };
}

const dataloggerSets = (board: ReturnType<typeof makeBoard>) =>
  board.written.filter((command) => command.object === "datalogger" && command.action === "set");

afterEach(() => {
  uninstallSerial();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DeviceConnectionPage", () => {
  it("explains when the browser has no Web Serial", () => {
    renderWithProviders(<DeviceConnectionPage />);
    expect(screen.getByText(/does not support Web Serial/i)).toBeInTheDocument();
  });

  it("tells the user to refresh when the port won't open", async () => {
    const board = boardPort(() => null, { failOpen: true });
    installSerial([], board.port);
    const user = userEvent.setup();
    server.use(...commonHandlers());

    renderWithProviders(<DeviceConnectionPage />);
    await user.click(await screen.findByRole("button", { name: "Connect board" }));

    expect(await screen.findByText(/refresh the page and connect again/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh page" })).toBeInTheDocument();
  });

  it("shows a board in update mode and offers to start its app", async () => {
    const board = boardPort(bootloaderBoard());
    installSerial([], board.port);
    const user = userEvent.setup();
    server.use(...commonHandlers());

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);

    expect(screen.getByText("Board is in update mode")).toBeInTheDocument();
    expect(screen.getByText("Installed (1.15.0)")).toBeInTheDocument();
    // The console offers bootloader commands, not the app's.
    expect(screen.getByRole("button", { name: "bootloader info" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "device get" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start the app" }));
    await waitFor(() =>
      expect(board.written).toContainEqual({ object: "bootloader", action: "boot" }),
    );
  });

  it("installs firmware from update mode and shows its progress", async () => {
    const respond = bootloaderBoard(false);
    const board = boardPort(respond);
    installSerial([], board.port);
    const user = userEvent.setup();
    server.use(...commonHandlers());

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    const file = new File([signedImage("2.0.0", 1300)], "rriv-2.0.0.bin");
    await user.upload(screen.getByLabelText(/signed image file/), file);
    expect(await screen.findByText("2.0.0")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Install 2.0.0" }));
    await user.click(screen.getByRole("button", { name: "Click again to install" }));
    expect(await screen.findByText(/Starting the new firmware/)).toBeInTheDocument();
    expect(respond.received).toHaveLength(1812);
    expect(board.written.at(-1)).toEqual({ object: "bootloader", action: "boot" });
  });

  it("installs the latest release, downloaded through rriv-api", async () => {
    const respond = bootloaderBoard(true);
    const board = boardPort(respond);
    installSerial([], board.port);
    const user = userEvent.setup();
    const release = (version: string, prerelease = false) => ({
      version,
      name: version,
      publishedAt: "2026-10-23T12:00:00Z",
      prerelease,
      notes: "",
      bootloaderVersion: "0.4.1",
      minBootloader: null,
      size: 1812,
    });
    server.use(
      // Ahead of commonHandlers' empty release list: the first match wins.
      http.get(`${API}/firmware/releases`, () =>
        HttpResponse.json([release("v2.2.0-beta.1", true), release("v2.1.0"), release("1.15.0")]),
      ),
      http.get(`${API}/firmware/releases/v2.1.0/image`, () =>
        HttpResponse.arrayBuffer(signedImage("v2.1.0", 1300).buffer as ArrayBuffer, {
          headers: { "content-type": "application/octet-stream" },
        }),
      ),
      ...commonHandlers(),
    );

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    const picker = await screen.findByRole("combobox");
    expect(picker).toHaveValue("v2.1.0");
    expect(screen.getByRole("option", { name: "1.15.0 (installed)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "v2.2.0-beta.1 (pre-release)" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Install v2.1.0" }));
    await user.click(screen.getByRole("button", { name: "Click again to install" }));
    expect(await screen.findByText(/Starting the new firmware/)).toBeInTheDocument();
    expect(respond.received).toHaveLength(1812);
  });

  it("marks releases that need a newer bootloader than the board's", async () => {
    const board = boardPort(bootloaderBoard(true));
    installSerial([], board.port);
    const user = userEvent.setup();
    const asked: (string | null)[] = [];
    const release = (version: string, minBootloader: string | null, compatible: boolean) => ({
      version,
      name: version,
      publishedAt: "2026-10-23T12:00:00Z",
      prerelease: false,
      notes: "",
      bootloaderVersion: "1.1.0",
      minBootloader,
      compatible,
      size: 1812,
    });
    server.use(
      http.get(`${API}/firmware/releases`, ({ request }) => {
        asked.push(new URL(request.url).searchParams.get("bootloader"));
        return HttpResponse.json([release("v2.2.0", "1.1.0", false), release("v2.1.0", "0.3.0", true)]);
      }),
      ...commonHandlers(),
    );

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    const picker = await screen.findByRole("combobox");
    // The board's bootloader (0.3.0, from `info`) goes to rriv-api.
    expect(asked).toContain("0.3.0");
    // The newest release it can take is picked; the other is shown, disabled.
    expect(picker).toHaveValue("v2.1.0");
    expect(screen.getByRole("option", { name: "v2.2.0 (needs bootloader 1.1.0)" })).toBeDisabled();
    expect(screen.getByText("0.3.0 or newer")).toBeInTheDocument();
  });

  it("records an install in the device's firmware history, with a retry", async () => {
    const respond = bootloaderBoard(false);
    const loader = boardPort(respond);
    const serial = installSerial([], loader.port);
    const user = userEvent.setup();
    const recorded = vi.fn();
    let fail = true;
    server.use(
      ...commonHandlers(),
      http.get(`${API}/device`, () => HttpResponse.json([device])),
      http.post(`${API}/device/firmware/history`, async ({ request }) => {
        recorded(await request.json());
        if (fail) return HttpResponse.json({ message: "database unavailable" }, { status: 500 });
        return new HttpResponse(null, { status: 201 });
      }),
    );

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    await user.upload(
      screen.getByLabelText(/signed image file/),
      new File([signedImage("2.0.0", 1300)], "rriv-2.0.0.bin"),
    );
    await user.click(await screen.findByRole("button", { name: "Install 2.0.0" }));
    await user.click(screen.getByRole("button", { name: "Click again to install" }));
    expect(await screen.findByText(/Starting the new firmware/)).toBeInTheDocument();

    // The bootloader starts the app: the port drops and the app comes back.
    await act(async () => {
      loader.unplug();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const app = makeBoard();
    await act(async () => serial.fire("connect", app.port));

    expect(await screen.findByText(/recording it in the device's firmware history failed/)).toBeInTheDocument();
    expect(recorded).toHaveBeenCalledWith({
      deviceId: "d1",
      contextId: "c1",
      version: "2.0.0",
      installedAt: expect.any(String),
    });

    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Recorded in the device's firmware history.")).toBeInTheDocument();
    expect(recorded).toHaveBeenCalledTimes(2);
  });

  it("explains a start-up that keeps stopping, and starts the app anyway", async () => {
    const board = boardPort(
      bootloaderBoard(true, { startupLoop: { stopped_at: "i2c_scan", unfinished: 3 } }),
    );
    installSerial([], board.port);
    const user = userEvent.setup();
    server.use(...commonHandlers());

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);

    expect(await screen.findByText(/start-up keeps stopping at/)).toHaveTextContent(
      "i2c_scan (3 start-ups in a row didn't finish)",
    );
    await user.click(screen.getByRole("button", { name: "Start the app anyway" }));
    await waitFor(() =>
      expect(board.written).toContainEqual({ object: "bootloader", action: "boot" }),
    );
  });

  it("refuses a file that isn't a signed image", async () => {
    installSerial([], boardPort(bootloaderBoard(false)).port);
    const user = userEvent.setup();
    server.use(...commonHandlers());

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    await user.upload(
      screen.getByLabelText(/signed image file/),
      new File([new Uint8Array(2000)], "app.bin"),
    );
    expect(await screen.findByText(/isn't a signed RRIV firmware image/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Install firmware" })).toBeDisabled();
  });

  it("says when a board in update mode has no app to start", async () => {
    installSerial([], boardPort(bootloaderBoard(false)).port);
    const user = userEvent.setup();
    server.use(...commonHandlers());

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);

    expect(screen.getByText("Not installed (no firmware)")).toBeInTheDocument();
    expect(screen.getByText(/No valid firmware is installed/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start the app" })).not.toBeInTheDocument();
  });

  it("connects a linked board straight into the workspace", async () => {
    const board = makeBoard();
    installSerial([], board.port);
    const user = userEvent.setup();
    server.use(...commonHandlers(), http.get(`${API}/device`, () => HttpResponse.json([device])));

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);

    expect((await screen.findAllByText("upstream")).length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    // Details are read once the board is confirmed as ours.
    expect((await screen.findAllByText("9.9.9")).length).toBeGreaterThan(0);
    // Once confirmed as ours, the clock is set like `rrivctl connect`.
    await waitFor(() => expect(board.written.some(isEpoch)).toBe(true));
    // Nothing the user didn't ask for: the telemeter isn't read on connect,
    // and the identity is read once.
    expect(board.written).not.toContainEqual({ object: "telemeter", action: "get" });
    expect(
      board.written.filter((command) => command.object === "device" && command.action === "get"),
    ).toHaveLength(1);
  });

  it("shows where the last start-up stopped", async () => {
    const board = makeBoard();
    board.state.startup = {
      previous_completed: false,
      stopped_at: "i2c2",
      failed_startups: 2,
      reset_cause: "watchdog",
      traced: false,
    };
    installSerial([], board.port);
    const user = userEvent.setup();
    const logged = vi.fn();
    server.use(
      ...commonHandlers(),
      http.get(`${API}/device`, () => HttpResponse.json([device])),
      http.post(`${API}/device/log`, async ({ request }) => {
        logged(await request.json());
        return new HttpResponse(null, { status: 201 });
      }),
    );

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);

    // Noted in the device's log in RRIV, for support.
    await waitFor(() =>
      expect(logged).toHaveBeenCalledWith({
        identifier: "SN-1",
        log: "web: start-up stopped at i2c2 (watchdog), 3 unfinished in a row",
      }),
    );
    expect(await screen.findByText(/The last start-up didn't finish/)).toHaveTextContent(
      "stopped at i2c2 and the board was reset (watchdog (the board stopped responding)). 2 start-ups in a row didn't finish before this one.",
    );
    await user.click(screen.getByRole("button", { name: "Trace the next start-up" }));
    await waitFor(() =>
      expect(board.written).toContainEqual({ object: "board", action: "diagnostic" }),
    );
  });

  it("says when the firmware keeps no start-up log", async () => {
    installSerial([], makeBoard().port);
    const user = userEvent.setup();
    server.use(...commonHandlers(), http.get(`${API}/device`, () => HttpResponse.json([device])));

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);

    expect(await screen.findByText(/doesn't keep a start-up log/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trace the next start-up" })).toBeDisabled();
  });

  it("resets the datalogger settings and records the defaults once the board is back", async () => {
    const board = makeBoard();
    const serial = installSerial([], board.port);
    const user = userEvent.setup();
    const synced = vi.fn();
    server.use(
      ...commonHandlers(),
      http.get(`${API}/device`, () => HttpResponse.json([device])),
      http.post(`${API}/datalogger/config`, async ({ request }) => {
        synced(await request.json());
        return new HttpResponse(null, { status: 201 });
      }),
    );

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    await user.click(await screen.findByRole("tab", { name: "Datalogger" }));
    await user.click(await screen.findByRole("button", { name: "Reset settings" }));
    await user.click(screen.getByRole("button", { name: "Click again to reset" }));

    expect(await screen.findByText(/Resetting the datalogger settings/)).toBeInTheDocument();
    expect(synced).not.toHaveBeenCalled();

    // The board restarts with its defaults.
    const restarted = makeBoard();
    restarted.state.datalogger = { site_name: "site", logger_name: "MyLogger", sleep_interval: 15, mode: "interactive" };
    restarted.state.sensors.clear();
    await act(async () => serial.fire("connect", restarted.port));

    expect(
      await screen.findByText("Datalogger settings reset to their defaults and recorded in RRIV."),
    ).toBeInTheDocument();
    expect(synced).toHaveBeenCalledTimes(1);
    expect(synced.mock.calls[0]![0]).toMatchObject({ deviceId: "d1", contextId: "c1" });
  });

  it("factory-resets a provisioner's board and leaves the device bound", async () => {
    const board = makeBoard();
    installSerial([], board.port);
    const user = userEvent.setup();
    const unbound = vi.fn();
    server.use(
      ...commonHandlers({ provisioner: true }),
      http.get(`${API}/device`, () => HttpResponse.json([device])),
      http.post(`${API}/device/SN-1/unbind`, () => {
        unbound();
        return HttpResponse.json(device);
      }),
    );

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    await user.click(await screen.findByRole("button", { name: "Factory reset" }));
    await user.click(screen.getByRole("button", { name: "Click again to wipe the board" }));

    await waitFor(() =>
      expect(board.written).toContainEqual({ object: "device", action: "reset", serial_number: "SN-1" }),
    );
    expect(
      await screen.findByText(
        "Board wiped. Device SN-1 is still in RRIV; provision the board to give it back serial number SN-1.",
      ),
    ).toBeInTheDocument();
    expect(unbound).not.toHaveBeenCalled();
  });

  it("offers factory reset only to provisioners", async () => {
    installSerial([], makeBoard().port);
    const user = userEvent.setup();
    server.use(...commonHandlers(), http.get(`${API}/device`, () => HttpResponse.json([device])));

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);

    expect(await screen.findByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Factory reset" })).not.toBeInTheDocument();
  });

  it("forwards a message out of the board's USART from the Overview tab", async () => {
    const board = makeBoard();
    installSerial([], board.port);
    const user = userEvent.setup();
    server.use(...commonHandlers(), http.get(`${API}/device`, () => HttpResponse.json([device])));

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);

    await user.type(await screen.findByRole("textbox", { name: "Message" }), "0xBEEF");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Message sent.")).toBeInTheDocument();
    expect(board.written).toContainEqual({ object: "serial", action: "send", message: "BEEF" });

    // It lives on Overview, not in the console.
    await user.click(screen.getByRole("tab", { name: "Console" }));
    expect(screen.queryByText("Serial out")).not.toBeInTheDocument();
  });

  it("reads the board's EUIs only when the user registers them", async () => {
    const board = makeBoard();
    installSerial([], board.port);
    const user = userEvent.setup();
    const registered = vi.fn();
    server.use(
      ...commonHandlers(),
      http.get(`${API}/device`, () => HttpResponse.json([device])),
      http.post(`${API}/device/registerEui`, async ({ request }) => {
        registered(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    const register = await screen.findByRole("button", { name: "Register EUI" });
    await waitFor(() => expect(register).toBeEnabled());
    await user.type(screen.getByLabelText(/Application/), "rriv-test");
    await user.click(register);

    expect(
      await screen.findByText("Registered Dev EUI DEVEUI1 (Join EUI JOINEUI1)."),
    ).toBeInTheDocument();
    expect(board.written).toContainEqual({ object: "telemeter", action: "get" });
    expect(registered).toHaveBeenCalledWith({
      deviceId: "d1",
      eui: "DEVEUI1",
      joinEui: "JOINEUI1",
      application: "rriv-test",
    });
  });

  it("fails Register EUI with the board's reply when it reports no EUIs", async () => {
    const board = boardPort((command) => {
      if (command.object === "device") return { serial_number: "SN-1", uid: UID, codes: [] };
      if (command.object === "telemeter") return { message: "Failed to get identifiers" };
      if (command.object === "datalogger") return { mode: "interactive" };
      return { message: "ok" };
    });
    installSerial([], board.port);
    const user = userEvent.setup();
    const registered = vi.fn();
    server.use(
      ...commonHandlers(),
      http.get(`${API}/device`, () => HttpResponse.json([device])),
      http.post(`${API}/device/registerEui`, () => {
        registered();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    const register = await screen.findByRole("button", { name: "Register EUI" });
    await waitFor(() => expect(register).toBeEnabled());
    await user.click(register);

    expect(
      await screen.findByText(
        "The board didn't report its EUIs. It replied: Failed to get identifiers",
      ),
    ).toBeInTheDocument();
    // Asked twice (like rrivctl), then nothing was sent to the cloud.
    expect(
      board.written.filter((command) => command.object === "telemeter"),
    ).toHaveLength(2);
    expect(registered).not.toHaveBeenCalled();
  });

  it("provisions a board without a serial number, then asks to link it", async () => {
    const board = makeBoard({ serialNumber: "" });
    installSerial([], board.port);
    const user = userEvent.setup();
    const provisioned = vi.fn();
    const bound = vi.fn();
    server.use(
      ...commonHandlers({ provisioner: true }),
      http.get(`${API}/device`, () => HttpResponse.json([])),
      http.post(`${API}/device`, async ({ request }) => {
        provisioned(await request.json());
        return HttpResponse.json({ ...unplaced, serialNumber: "SN-NEW" });
      }),
      http.post(`${API}/device/:serial/bind`, ({ params }) => {
        bound(params.serial);
        return HttpResponse.json({ ...unplaced, serialNumber: "SN-NEW" });
      }),
    );

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);

    await user.click(await screen.findByRole("button", { name: "Provision board" }));
    await waitFor(() => expect(provisioned).toHaveBeenCalledWith({ uid: UID, type: "rriv_0_4_2" }));
    expect(board.state.serialNumber).toBe("SN-NEW");
    // The new serial number is bound straight away, then a context is asked for.
    expect(await screen.findByText("Choose a context for this board")).toBeInTheDocument();
    expect(bound).toHaveBeenCalledWith("SN-NEW");
  });

  it("asks non-provisioners to get an unprovisioned board provisioned", async () => {
    const board = makeBoard({ serialNumber: "" });
    installSerial([], board.port);
    const user = userEvent.setup();
    server.use(...commonHandlers({ provisioner: false }));

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);

    expect(await screen.findByText("This board hasn't been provisioned")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Provision board" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Sensors" })).not.toBeInTheDocument();
    expect(board.written).toEqual([{ object: "device", action: "get" }]);
  });

  it("binds a new board on connect, then places it and uploads its datalogger config", async () => {
    const board = makeBoard();
    installSerial([], board.port);
    const user = userEvent.setup();
    let linked = false;
    let placedYet = false;
    const placed = vi.fn();
    const uploaded = vi.fn();
    server.use(
      ...commonHandlers(),
      http.get(`${API}/device`, () =>
        HttpResponse.json(linked ? [placedYet ? device : unplaced] : []),
      ),
      http.post(`${API}/device/:serial/bind`, () => {
        linked = true;
        return HttpResponse.json(unplaced);
      }),
      http.post(`${API}/context/:cid/device/:did`, async ({ params, request }) => {
        placed(params, await request.json());
        placedYet = true;
        return HttpResponse.json({});
      }),
      http.post(`${API}/datalogger/config`, async ({ request }) => {
        uploaded(await request.json());
        return new HttpResponse(null, { status: 201 });
      }),
    );

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);

    await screen.findByRole("option", { name: "well-a" });
    await user.selectOptions(screen.getByLabelText("Context"), "c1");
    await user.click(screen.getByRole("button", { name: "Add to context" }));

    expect(await screen.findByText(/logger-a is ready/)).toBeInTheDocument();
    expect(placed).toHaveBeenCalledWith(
      { cid: "c1", did: "d1" },
      { assignedDeviceName: "logger-a" },
    );
    expect(uploaded).toHaveBeenCalledWith(
      expect.objectContaining({
        dataloggerDriverId: "dd1",
        deviceId: "d1",
        contextId: "c1",
        config: expect.objectContaining({ object: "datalogger", site_name: "SITE-A" }),
      }),
    );
  });

  it("locks the board tools when it belongs to another account", async () => {
    const board = makeBoard();
    installSerial([], board.port);
    const user = userEvent.setup();
    server.use(
      ...commonHandlers(),
      http.get(`${API}/device`, () => HttpResponse.json([])),
      http.post(`${API}/device/:serial/bind`, () =>
        HttpResponse.json({ message: "device bound to another user" }, { status: 409 }),
      ),
    );

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);

    expect(await screen.findByText("This board belongs to another account")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Sensors" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Skip/ })).not.toBeInTheDocument();
    // Only the identity is read from someone else's board; nothing is written.
    expect(board.written).toEqual([{ object: "device", action: "get" }]);
    // And nothing about the board is shown.
    expect(screen.getByText("RRIV board connected")).toBeInTheDocument();
    expect(screen.queryByText(/SN-1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/9\.9\.9/)).not.toBeInTheDocument();
    expect(screen.queryByText(/interactive mode/)).not.toBeInTheDocument();
  });

  it("locks the board tools when RRIV doesn't know its serial number", async () => {
    installSerial([], makeBoard().port);
    const user = userEvent.setup();
    server.use(
      ...commonHandlers(),
      http.get(`${API}/device`, () => HttpResponse.json([])),
      http.post(`${API}/device/:serial/bind`, () =>
        HttpResponse.json({ message: "invalid serial number received" }, { status: 422 }),
      ),
    );

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);

    expect(await screen.findByText("RRIV doesn't recognise this board")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Sensors" })).not.toBeInTheDocument();
  });

  it("fails closed when ownership can't be checked, and retries", async () => {
    installSerial([], makeBoard().port);
    const user = userEvent.setup();
    let down = true;
    server.use(
      ...commonHandlers(),
      http.get(`${API}/device`, () =>
        down
          ? HttpResponse.json({ message: "unavailable" }, { status: 503 })
          : HttpResponse.json([device]),
      ),
    );

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);

    expect(await screen.findByText(/Couldn't confirm this board/)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Sensors" })).not.toBeInTheDocument();
    down = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("tab", { name: "Sensors" })).toBeInTheDocument();
  });

  it("lets an owned board without a context be used before it's placed", async () => {
    installSerial([], makeBoard().port);
    const user = userEvent.setup();
    server.use(...commonHandlers(), http.get(`${API}/device`, () => HttpResponse.json([unplaced])));

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    await user.click(await screen.findByRole("button", { name: "Skip for now" }));

    expect(screen.getByText(/Not in a context yet/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sensors" })).toBeInTheDocument();
  });

  it("applies only changed datalogger settings and syncs them", async () => {
    const board = makeBoard();
    const { user, synced } = await openDatalogger(board);

    const site = screen.getByLabelText(/Site name/);
    await user.clear(site);
    await user.type(site, "NEW");
    await user.click(screen.getByRole("button", { name: "Apply datalogger config" }));

    expect(await screen.findByText(/applied to the board and synced/)).toBeInTheDocument();
    expect(board.written).toContainEqual({ object: "datalogger", action: "set", site_name: "NEW" });
    expect(synced).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ site_name: "NEW" }) }),
    );
  });

  it("sends settings as the board names them, and flags ones its reply doesn't reflect", async () => {
    const board = makeBoard();
    const { user, synced } = await openDatalogger(board);

    const bursts = screen.getByLabelText(/Bursts per measurement cycle/);
    await user.clear(bursts);
    await user.type(bursts, "3");
    await user.click(screen.getByRole("button", { name: "Apply datalogger config" }));

    // The page doesn't rename or filter anything for the firmware.
    expect(dataloggerSets(board)).toContainEqual({
      object: "datalogger",
      action: "set",
      bursts_per_measurement_cycle: 3,
    });
    expect(
      await screen.findByText(
        /doesn't reflect every change: bursts_per_measurement_cycle is 1 \(sent 3\)/,
      ),
    ).toBeInTheDocument();
    // What the board reported is still what's uploaded.
    expect(synced).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ bursts_per_measurement_cycle: 1 }),
      }),
    );
  });

  it("shows and uploads the board's big numbers exactly", async () => {
    const board = makeBoard();
    // A u64 the board reports; a plain JS number would round it.
    board.state.datalogger.deployment_timestamp = (
      JSON as JSON & { rawJSON: (text: string) => unknown }
    ).rawJSON("18446744073709551615");
    installSerial([], board.port);
    const user = userEvent.setup();
    const uploads: string[] = [];
    server.use(
      ...commonHandlers(),
      http.get(`${API}/device`, () => HttpResponse.json([device])),
      http.post(`${API}/datalogger/config`, async ({ request }) => {
        uploads.push(await request.text());
        return new HttpResponse(null, { status: 201 });
      }),
    );
    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    await user.click(await screen.findByRole("tab", { name: "Datalogger" }));

    const timestamp = (await screen.findByLabelText(/Deployment timestamp/)) as HTMLInputElement;
    expect(timestamp.value).toBe("18446744073709551615");

    const site = screen.getByLabelText(/Site name/);
    await user.clear(site);
    await user.type(site, "NEW");
    await user.click(screen.getByRole("button", { name: "Apply datalogger config" }));

    expect(await screen.findByText(/applied to the board and synced/)).toBeInTheDocument();
    // Only the change is sent; the timestamp isn't echoed back to the board.
    expect(dataloggerSets(board)).toEqual([
      { object: "datalogger", action: "set", site_name: "NEW" },
    ]);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toContain('"deployment_timestamp":18446744073709551615');
  });

  it("still uploads the board's reply when it ignored a change", async () => {
    const board = makeBoard();
    const { user, synced } = await openDatalogger(board);

    await user.click(screen.getByRole("button", { name: "JSON" }));
    fireEvent.change(screen.getByLabelText("Datalogger config JSON"), {
      target: { value: JSON.stringify({ ...board.state.datalogger, delay_between_bursts: 5 }) },
    });
    await user.click(screen.getByRole("button", { name: "Apply datalogger config" }));

    expect(
      await screen.findByText(/doesn't reflect every change: delay_between_bursts is 0 \(sent 5\)/),
    ).toBeInTheDocument();
    // Only the difference was sent, and the board's reply was uploaded as-is.
    expect(dataloggerSets(board)).toEqual([
      { object: "datalogger", action: "set", delay_between_bursts: 5 },
    ]);
    expect(synced).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ delay_between_bursts: 0 }) }),
    );
  });

  it("doesn't write or sync when nothing differs from what the board reported", async () => {
    const board = makeBoard();
    const { user, synced } = await openDatalogger(board);

    await user.click(screen.getByRole("button", { name: "JSON" }));
    await user.click(screen.getByRole("button", { name: "Apply datalogger config" }));

    expect(
      await screen.findByText("Nothing to apply: no setting differs from what the board reported."),
    ).toBeInTheDocument();
    expect(dataloggerSets(board)).toEqual([]);
    expect(synced).not.toHaveBeenCalled();
  });

  it("renders a real board's datalogger reply (every field, u64 and padded names)", async () => {
    // Captured from a real board over the Console.
    const reported =
      '{"bursts_per_measurement_cycle":1,"delay_between_bursts":0,"deployment_identifier":"deployment******","deployment_timestamp":18446744073709551615,"enable_lorawan_telemetry":true,"enable_modbus_rtu":true,"enable_sdi12":false,"interactive_logging":true,"interactive_logging_interval":2,"logger_name":"MyLogger","mode":"interactive","site_name":"site****","sleep_interval":15,"start_up_delay":0}';
    const board = boardPort((command) => {
      if (command.object === "device") return { serial_number: "SN-1", uid: UID, codes: [] };
      if (command.object === "board" && command.action === "get") {
        return { message: JSON.stringify({ fv: "v1.13.0" }) };
      }
      if (command.object === "datalogger") return reported;
      if (command.object === "telemeter") return { dev_eui: "D", join_eui: "J" };
      return { message: "ok" };
    });
    installSerial([], board.port);
    const user = userEvent.setup();
    const errors = vi.spyOn(console, "error");
    server.use(...commonHandlers(), http.get(`${API}/device`, () => HttpResponse.json([device])));

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    await user.click(await screen.findByRole("tab", { name: "Datalogger" }));

    for (const label of [
      /Bursts per measurement cycle/,
      /Delay between bursts/,
      /Deployment identifier/,
      /Enable lorawan telemetry/,
      /Interactive logging interval/,
      /Start up delay/,
    ]) {
      expect(await screen.findByLabelText(label)).toBeInTheDocument();
    }
    expect((screen.getByLabelText(/Deployment timestamp/) as HTMLInputElement).value).toBe(
      "18446744073709551615",
    );
    expect(screen.getByLabelText(/Site name/)).toHaveValue("site****");
    expect(errors).not.toHaveBeenCalled();
  });

  it("uploads the board's reply after a mode change", async () => {
    const board = makeBoard();
    board.state.datalogger.mode = "field";
    const { user, synced } = await openDatalogger(board);

    await user.click(screen.getByRole("button", { name: "Switch to interactive" }));

    expect(
      await screen.findByText(/interactive mode applied to the board and synced/),
    ).toBeInTheDocument();
    expect(dataloggerSets(board)).toEqual([
      { object: "datalogger", action: "set", mode: "interactive" },
    ]);
    expect(synced).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ mode: "interactive" }) }),
    );
  });

  it("separates a failed cloud sync from the board write and offers a retry", async () => {
    installSerial([], makeBoard().port);
    const user = userEvent.setup();
    let fail = true;
    server.use(
      ...commonHandlers(),
      http.get(`${API}/device`, () => HttpResponse.json([device])),
      http.post(`${API}/datalogger/config`, () =>
        fail
          ? HttpResponse.json({ message: "invalid config received" }, { status: 422 })
          : new HttpResponse(null, { status: 201 }),
      ),
    );

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    await user.click(await screen.findByRole("tab", { name: "Datalogger" }));
    const interval = await screen.findByLabelText(/Sleep interval/);
    await user.clear(interval);
    await user.type(interval, "30");
    await user.click(screen.getByRole("button", { name: "Apply datalogger config" }));

    expect(
      await screen.findByText(/applied to the board, but the cloud sync failed: invalid config/),
    ).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry sync" }));
    expect(await screen.findByText(/applied to the board and synced/)).toBeInTheDocument();
  });

  it("edits a sensor without resending its type, and adds and removes sensors", async () => {
    const board = makeBoard();
    installSerial([], board.port);
    const user = userEvent.setup();
    const synced = vi.fn();
    const removed = vi.fn();
    server.use(
      ...commonHandlers(),
      http.get(`${API}/device`, () => HttpResponse.json([device])),
      http.post(`${API}/sensor/config`, async ({ request }) => {
        synced(await request.json());
        return new HttpResponse(null, { status: 201 });
      }),
      http.post(`${API}/sensor/config/deactivate`, async ({ request }) => {
        removed(await request.json());
        return HttpResponse.json(null);
      }),
    );

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    await user.click(await screen.findByRole("tab", { name: "Sensors" }));

    const wait = await screen.findByLabelText(/Wait time/);
    await user.clear(wait);
    await user.type(wait, "9");
    await user.click(screen.getByRole("button", { name: "Apply sensor config" }));
    expect(await screen.findByText(/Sensor config applied to the board and synced/)).toBeInTheDocument();
    expect(board.written).toContainEqual({ object: "sensor", action: "set", id: "temp01", wait_time: 9 });
    expect(synced).toHaveBeenCalledWith(
      expect.objectContaining({ name: "temp01", config: expect.objectContaining({ wait_time: 9 }) }),
    );

    await user.click(screen.getByRole("button", { name: "Add sensor" }));
    await user.type(screen.getByPlaceholderText("e.g. temp01"), "PH01");
    const type = screen.getByPlaceholderText("e.g. ring_temperature");
    // No defined list of types yet: a plain text field, no suggestions.
    expect(type).not.toHaveAttribute("list");
    await user.type(type, "ph");
    await user.click(screen.getByRole("button", { name: "Add to board" }));
    expect(await screen.findByText("Sensor ph01")).toBeInTheDocument();
    expect(board.state.sensors.has("ph01")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Remove sensor ph01" }));
    await user.click(screen.getByRole("button", { name: "Remove?" }));
    await waitFor(() => expect(board.state.sensors.has("ph01")).toBe(false));
    // The removal reaches the cloud, and hand edits carry no library source.
    expect(await screen.findByText(/Removal of sensor ph01 applied to the board and synced/)).toBeInTheDocument();
    expect(removed).toHaveBeenCalledWith(expect.objectContaining({ name: "ph01", deviceId: device.id }));
    for (const [body] of synced.mock.calls) expect(body).not.toHaveProperty("source");
  });

  describe("applying a library config", () => {
    const systemLibrary: LibraryConfigDetail = {
      id: "lib1",
      name: "well-standard",
      isPublic: true,
      createdAt: "2026-01-01T00:00:00Z",
      SystemLibraryConfigVersion: [
        {
          id: "slv2",
          version: 2,
          firmwareVersion: "1.4.0",
          ConfigSnapshot: {
            id: "snap2",
            name: "well-standard",
            DataloggerConfig: [
              { id: "dc1", config: { object: "datalogger", site_name: "SITE-B", mode: "field" } },
            ],
            SensorConfig: [
              { id: "sc1", name: "temp01", config: { object: "sensor", type: "ds18b20", wait_time: 9 } },
              { id: "sc2", name: "co2", config: { object: "sensor", type: "k30_co2", wait_time: 2 } },
            ],
          },
        },
        {
          version: 1,
          ConfigSnapshot: { id: "snap1", name: "well-standard", DataloggerConfig: [], SensorConfig: [] },
        },
      ],
    };

    /** A linked board with an extra sensor, opened from a library link; returns the upload spies. */
    async function openFromLink(board: ReturnType<typeof makeBoard>, library = systemLibrary) {
      board.state.sensors.set("ph01", { id: "ph01", type: "ph", wait_time: 1 });
      installSerial([], board.port);
      const user = userEvent.setup();
      const dataloggerSynced = vi.fn();
      const sensorSynced = vi.fn();
      const sensorRemoved = vi.fn();
      server.use(
        ...commonHandlers(),
        http.get(`${API}/device`, () => HttpResponse.json([device])),
        http.get(`${API}/configSnapshot/libraryConfig`, () => HttpResponse.json([library])),
        http.get(`${API}/configSnapshot/libraryConfig/lib1`, () => HttpResponse.json(library)),
        http.post(`${API}/sensor/config/deactivate`, async ({ request }) => {
          sensorRemoved(await request.json());
          return HttpResponse.json(null);
        }),
        http.post(`${API}/datalogger/config`, async ({ request }) => {
          dataloggerSynced(await request.json());
          return new HttpResponse(null, { status: 201 });
        }),
        http.post(`${API}/sensor/config`, async ({ request }) => {
          sensorSynced(await request.json());
          return new HttpResponse(null, { status: 201 });
        }),
      );
      renderWithProviders(<DeviceConnectionPage />, { route: "/connect?apply=system:lib1:2" });
      await connect(user);
      expect(await screen.findByRole("tab", { name: "From library" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await waitFor(() =>
        expect(screen.getByLabelText("Version")).toHaveDisplayValue(/v2 \(latest\)/),
      );
      return { user, dataloggerSynced, sensorSynced, sensorRemoved };
    }

    it("opens a library link ready to apply, previews it, and replaces the board's config", async () => {
      const board = makeBoard();
      const { user, dataloggerSynced, sensorSynced, sensorRemoved } = await openFromLink(board);
      // Saved with other firmware than the board's (9.9.9): a warning, not a block.
      expect(screen.getByText(/Saved with firmware 1\.4\.0; this board runs 9\.9\.9/)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Review changes" }));
      const planned = await screen.findByRole("list", { name: "Planned changes" });
      const steps = within(planned).getAllByRole("listitem");
      expect(steps.map((step) => step.textContent)).toEqual([
        expect.stringContaining("Remove sensor ph01 (ph); it isn't in this config"),
        expect.stringContaining("Datalogger: change 1 setting"),
        expect.stringContaining("Sensor temp01: change 1 setting"),
        expect.stringContaining("Add sensor co2 (k30_co2)"),
      ]);
      // Field mode is never sent from the library.
      expect(screen.getByText(/applying field mode would stop the board answering/)).toBeInTheDocument();
      expect(board.state.sensors.has("ph01")).toBe(true);

      await user.click(screen.getByRole("button", { name: "Apply 4 changes" }));
      expect(await screen.findByText(/Applied to the board\. The board's new config is synced/)).toBeInTheDocument();

      expect(board.state.sensors.has("ph01")).toBe(false);
      expect(board.state.datalogger.site_name).toBe("SITE-B");
      expect(board.state.datalogger.mode).toBe("interactive");
      expect(board.state.sensors.get("co2")).toMatchObject({ type: "k30_co2", wait_time: 2 });
      expect(board.written).toContainEqual({ object: "sensor", action: "set", id: "temp01", wait_time: 9 });
      expect(dataloggerSynced).toHaveBeenCalledWith(
        expect.objectContaining({ config: expect.objectContaining({ site_name: "SITE-B" }) }),
      );
      expect(sensorSynced.mock.calls.map(([body]) => (body as { name: string }).name).sort()).toEqual([
        "co2",
        "temp01",
      ]);
      // Each upload records the library version it came from.
      const source = { kind: "system", versionId: "slv2" };
      expect(dataloggerSynced).toHaveBeenCalledWith(expect.objectContaining({ source }));
      for (const [body] of sensorSynced.mock.calls) expect(body).toMatchObject({ source });
      // The sensor the config doesn't have is ended in the cloud.
      expect(sensorRemoved).toHaveBeenCalledTimes(1);
      expect(sensorRemoved).toHaveBeenCalledWith(
        expect.objectContaining({ name: "ph01", deviceId: device.id }),
      );
    });

    it("has no firmware warning when the board runs the saved firmware", async () => {
      const board = makeBoard();
      const [latest, ...older] = systemLibrary.SystemLibraryConfigVersion ?? [];
      await openFromLink(board, {
        ...systemLibrary,
        SystemLibraryConfigVersion: [{ ...latest, firmwareVersion: "9.9.9" }, ...older],
      });
      expect(screen.queryByText(/Saved with firmware/)).not.toBeInTheDocument();
    });

    it("stops at a failed step and retries only the rest", async () => {
      const board = makeBoard();
      const { user, sensorSynced } = await openFromLink(board);
      // The board refuses to add the new sensor the first time.
      board.state.refuse = (command) => command.object === "sensor" && command.id === "co2";

      await user.click(screen.getByRole("button", { name: "Review changes" }));
      await user.click(await screen.findByRole("button", { name: "Apply 4 changes" }));
      expect(await screen.findByText(/The apply stopped part-way/)).toBeInTheDocument();
      expect(screen.getByText("Failed")).toBeInTheDocument();
      expect(screen.getByText("sensor type not found")).toBeInTheDocument();
      // What did reach the board is still uploaded.
      expect(sensorSynced).toHaveBeenCalledWith(expect.objectContaining({ name: "temp01" }));
      expect(board.state.sensors.has("co2")).toBe(false);

      board.state.refuse = null;
      const removes = board.written.filter((command) => command.action === "remove").length;
      await user.click(screen.getByRole("button", { name: "Retry the rest" }));
      expect(await screen.findByText(/Applied to the board\. The board's new config is synced/)).toBeInTheDocument();
      expect(board.state.sensors.get("co2")).toMatchObject({ type: "k30_co2" });
      // The steps that were done aren't sent again.
      expect(board.written.filter((command) => command.action === "remove")).toHaveLength(removes);
    });

    it("applies a saved snapshot from its link, clearing the library source", async () => {
      const board = makeBoard();
      board.state.sensors.set("ph01", { id: "ph01", type: "ph", wait_time: 1 });
      installSerial([], board.port);
      const user = userEvent.setup();
      const dataloggerSynced = vi.fn();
      const sensorSynced = vi.fn();
      const sensorRemoved = vi.fn();
      const snapshot = {
        id: "snap1",
        name: "before-trip",
        DataloggerConfig: [{ id: "d1", config: { object: "datalogger", site_name: "SITE-C" } }],
        SensorConfig: [{ id: "s1", name: "temp01", config: { object: "sensor", type: "ds18b20", wait_time: 4 } }],
      };
      server.use(
        ...commonHandlers(),
        http.get(`${API}/device`, () => HttpResponse.json([device])),
        http.get(`${API}/configSnapshot`, () => HttpResponse.json([snapshot])),
        http.post(`${API}/datalogger/config`, async ({ request }) => {
          dataloggerSynced(await request.json());
          return new HttpResponse(null, { status: 201 });
        }),
        http.post(`${API}/sensor/config`, async ({ request }) => {
          sensorSynced(await request.json());
          return new HttpResponse(null, { status: 201 });
        }),
        http.post(`${API}/sensor/config/deactivate`, async ({ request }) => {
          sensorRemoved(await request.json());
          return HttpResponse.json(null);
        }),
      );
      renderWithProviders(<DeviceConnectionPage />, { route: "/connect?apply=saved:snap1" });
      await connect(user);
      expect(await screen.findByLabelText("Config type")).toHaveDisplayValue(/Saved config/);
      await waitFor(() => expect(screen.getByLabelText("Saved config")).toHaveDisplayValue("before-trip"));
      expect(screen.queryByLabelText("Version")).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "View in library" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Review changes" }));
      const planned = await screen.findByRole("list", { name: "Planned changes" });
      expect(within(planned).getByText(/Remove sensor ph01/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /^Apply \d+ changes?$/ }));
      expect(await screen.findByText(/Applied to the board\. The board's new config is synced/)).toBeInTheDocument();

      expect(board.state.sensors.has("ph01")).toBe(false);
      expect(board.state.datalogger.site_name).toBe("SITE-C");
      // Not a library version: every upload clears the source.
      expect(dataloggerSynced).toHaveBeenCalledWith(expect.objectContaining({ source: null }));
      for (const [body] of sensorSynced.mock.calls) expect(body).toMatchObject({ source: null });
      expect(sensorRemoved).toHaveBeenCalledWith(expect.objectContaining({ name: "ph01" }));
    });

    const sourceInfo = (versionId: string) => ({
      kind: "system",
      versionId,
      version: 2,
      libraryConfigId: "lib1",
      name: "well-standard",
      latestVersion: 2,
      updateAvailable: false,
      changedSettings: 0,
    });
    /** The cloud's record for the board, every object recorded as `versionId` (or none). */
    const activeHandler = (record: () => string | null) =>
      http.get(`${API}/configSnapshot/active`, () =>
        HttpResponse.json({
          dataloggerConfig: {
            config: { site_name: "SITE-B" },
            source: record() ? sourceInfo(record()!) : null,
          },
          sensorConfig: ["temp01", "co2"].map((name) => ({
            id: name,
            name,
            config: {},
            source: record() ? sourceInfo(record()!) : null,
          })),
        }),
      );

    /** A board that already matches v2 exactly. */
    const matchingBoard = () => {
      const board = makeBoard();
      board.state.datalogger.site_name = "SITE-B";
      board.state.sensors.set("temp01", { id: "temp01", type: "ds18b20", wait_time: 9 });
      board.state.sensors.set("co2", { id: "co2", type: "k30_co2", wait_time: 2 });
      return board;
    };

    it("records every object a complete apply covers, matching ones too", async () => {
      const board = makeBoard();
      // The datalogger already matches v2; the sensors don't.
      board.state.datalogger.site_name = "SITE-B";
      const { user, dataloggerSynced, sensorSynced } = await openFromLink(board);

      await user.click(screen.getByRole("button", { name: "Review changes" }));
      const planned = await screen.findByRole("list", { name: "Planned changes" });
      expect(within(planned).queryByText(/^Datalogger/)).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /^Apply \d+ changes?$/ }));
      expect(await screen.findByText(/Applied to the board\. The board's new config is synced/)).toBeInTheDocument();

      const source = { kind: "system", versionId: "slv2" };
      expect(dataloggerSynced).toHaveBeenCalledWith(expect.objectContaining({ source }));
      expect(sensorSynced.mock.calls.map(([body]) => (body as { name: string }).name).sort()).toEqual([
        "co2",
        "temp01",
      ]);
    });

    it("offers to record a matching board as on the version, then says it's applied", async () => {
      const board = matchingBoard();
      let recorded: string | null = null;
      server.use(activeHandler(() => recorded));
      const { user, dataloggerSynced, sensorSynced } = await openFromLink(board);
      board.state.sensors.delete("ph01");
      server.use(
        http.post(`${API}/datalogger/config`, async ({ request }) => {
          dataloggerSynced(await request.json());
          recorded = "slv2";
          return new HttpResponse(null, { status: 201 });
        }),
      );

      await user.click(screen.getByRole("button", { name: "Review changes" }));
      expect(await screen.findByText(/already matches this config/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Apply \d/ })).not.toBeInTheDocument();
      const writes = board.written.length;

      await user.click(await screen.findByRole("button", { name: "Record as applied" }));
      expect(await screen.findByText("v2 is already applied to this board. Nothing to send.")).toBeInTheDocument();
      const source = { kind: "system", versionId: "slv2" };
      expect(dataloggerSynced).toHaveBeenCalledWith(expect.objectContaining({ source }));
      expect(sensorSynced.mock.calls.map(([body]) => (body as { name: string }).name).sort()).toEqual([
        "co2",
        "temp01",
      ]);
      // Nothing was set on the board; it was only read back.
      expect(board.written.slice(writes).every((command) => command.action !== "set" && command.action !== "remove")).toBe(true);
    });

    it("says the version is already applied when the cloud records it", async () => {
      const board = matchingBoard();
      server.use(activeHandler(() => "slv2"));
      const { user } = await openFromLink(board);
      board.state.sensors.delete("ph01");

      await user.click(screen.getByRole("button", { name: "Review changes" }));
      expect(await screen.findByText("v2 is already applied to this board. Nothing to send.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Record as applied" })).not.toBeInTheDocument();
    });
  });

  it("streams live frames and downloads them in the CLI's log format", async () => {
    const board = makeBoard();
    installSerial([], board.port);
    const user = userEvent.setup();
    server.use(...commonHandlers(), http.get(`${API}/device`, () => HttpResponse.json([device])));

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    await user.click(await screen.findByRole("tab", { name: /Live data/ }));
    await user.click(screen.getByRole("button", { name: "Start watch" }));
    expect((await screen.findAllByText("Streaming")).length).toBeGreaterThan(0);

    await act(async () => {
      board.push("1,2,3");
      board.push('{"status":"ok"}');
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    expect((await screen.findAllByText("1,2,3")).length).toBeGreaterThan(0);
    expect(screen.getByText("1 frames")).toBeInTheDocument();

    // Stubbed late: the API mocks need the real URL.
    const createObjectURL = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", Object.assign(() => {}, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await user.click(screen.getByRole("button", { name: "Download log" }));
    vi.unstubAllGlobals();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Stop watch" }));
    expect(await screen.findByRole("button", { name: "Start watch" })).toBeInTheDocument();
  });

  it("sends console commands and shows the transcript", async () => {
    installSerial([], makeBoard().port);
    const user = userEvent.setup();
    server.use(...commonHandlers(), http.get(`${API}/device`, () => HttpResponse.json([device])));

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    await user.click(await screen.findByRole("tab", { name: "Console" }));
    await user.click(screen.getByRole("button", { name: "sensor list" }));

    const log = screen.getByRole("log", { name: "Serial transcript" });
    expect(
      await within(log).findByText('{"sensors":[{"id":"temp01","type":"ds18b20"}]}'),
    ).toBeInTheDocument();
  });

  it("tells the user when the board is unplugged", async () => {
    const board = makeBoard();
    installSerial([], board.port);
    const user = userEvent.setup();
    server.use(...commonHandlers(), http.get(`${API}/device`, () => HttpResponse.json([device])));

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    await act(async () => {
      board.unplug();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(await screen.findByText(/The board disconnected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
  });

  it("reports a crash mid-command and recovers when the board reboots", async () => {
    const board = makeBoard();
    const serial = installSerial([], board.port);
    const user = userEvent.setup();
    let lookups = 0;
    server.use(
      ...commonHandlers(),
      http.get(`${API}/device`, () => {
        lookups += 1;
        return HttpResponse.json([device]);
      }),
    );

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);
    await user.click(await screen.findByRole("tab", { name: "Console" }));

    // The next command crashes the board, which then drops off USB.
    board.state.crashNext = true;
    await user.click(screen.getByRole("button", { name: "sensor list" }));
    expect(
      (await screen.findAllByText(/crashed \(heap exhausted\) and is restarting/)).length,
    ).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: "Reconnect" })).toBeInTheDocument();
    const lookupsBeforeReboot = lookups;

    // The watchdog reset brings it back; it says it's ready once booted.
    const rebooted = makeBoard();
    await act(async () => serial.fire("connect", rebooted.port));
    expect(await screen.findByText(/Waiting for the board to finish starting/)).toBeInTheDocument();
    // Nothing is sent to the board while it boots.
    expect(rebooted.written).toEqual([]);
    await act(async () => {
      rebooted.push('{"status":"datalogger-ready"}');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      await screen.findByText(/crashed \(heap exhausted\) and restarted/),
    ).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "Sensors" })).toBeInTheDocument();
    // Ownership was checked again for the new connection.
    expect(lookups).toBeGreaterThan(lookupsBeforeReboot);
  });
});
