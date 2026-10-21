import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Device } from "@/api/types";
import { DeviceConnectionPage } from "@/pages/DeviceConnectionPage";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";
import {
  boardPort,
  bootloaderBoard,
  installSerial,
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
  };
  const respond = (command: Command): Command | string | null => {
    const { object, action, id } = command;
    if (state.crashNext) {
      state.crashNext = false;
      setTimeout(() => board.unplug(), 20);
      return '{"status":"panic","message":"heap exhausted"}';
    }
    if (object === "device" && action === "get") {
      return { serial_number: state.serialNumber, uid: UID, codes: [] };
    }
    if (object === "device" && action === "set") {
      state.serialNumber = String(command.serial_number);
      return { message: "ok" };
    }
    if (object === "board" && action === "get") return { message: JSON.stringify({ fv: "9.9.9" }) };
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

  it("shows a board in update mode and offers to start its app", async () => {
    const board = boardPort(bootloaderBoard());
    installSerial([], board.port);
    const user = userEvent.setup();
    server.use(...commonHandlers());

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);

    expect(screen.getByText("Board is in update mode")).toBeInTheDocument();
    expect(screen.getByText("Installed")).toBeInTheDocument();
    // The console offers bootloader commands, not the app's.
    expect(screen.getByRole("button", { name: "bootloader info" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "device get" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start the app" }));
    await waitFor(() =>
      expect(board.written).toContainEqual({ object: "bootloader", action: "boot" }),
    );
  });

  it("says when a board in update mode has no app to start", async () => {
    installSerial([], boardPort(bootloaderBoard(false)).port);
    const user = userEvent.setup();
    server.use(...commonHandlers());

    renderWithProviders(<DeviceConnectionPage />);
    await connect(user);

    expect(screen.getByText("Not installed")).toBeInTheDocument();
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
    server.use(
      ...commonHandlers(),
      http.get(`${API}/device`, () => HttpResponse.json([device])),
      http.post(`${API}/sensor/config`, async ({ request }) => {
        synced(await request.json());
        return new HttpResponse(null, { status: 201 });
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
