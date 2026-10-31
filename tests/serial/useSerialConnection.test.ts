import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  type SerialPort,
  type WatchFrame,
  type WatchSink,
  parseFirmwareImage,
  useSerialConnection,
} from "@/serial";
import { hookWrapper } from "../helpers/render";
import {
  boardPort,
  bootloaderBoard,
  defaultBoard,
  installSerial,
  signedImage,
  uninstallSerial,
} from "./fakeBoard";

function renderConnection() {
  return renderHook(() => useSerialConnection(), { wrapper: hookWrapper() });
}

async function connectHook() {
  const board = boardPort(defaultBoard);
  const serial = installSerial([board.port]);
  const { result } = renderConnection();
  await waitFor(() => expect(result.current.ports).toHaveLength(1));
  await act(() => result.current.connect(board.port));
  await waitFor(() => expect(result.current.status).toBe("connected"));
  return { result, board, serial };
}

afterEach(uninstallSerial);

describe("useSerialConnection", () => {
  it("explains the disconnect after a command that restarts the board", async () => {
    const { result, board } = await connectHook();
    await act(() =>
      result.current.sendRestarting(
        { object: "datalogger", action: "reset" },
        "Resetting the datalogger settings to their defaults.",
      ),
    );
    await act(async () => {
      board.unplug();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(result.current.status).toBe("lost"));
    expect(result.current.error).toBe("Resetting the datalogger settings to their defaults.");
  });

  it("reports support when Web Serial is absent", () => {
    const { result } = renderConnection();
    expect(result.current.supported).toBe(false);
    expect(result.current.ports).toEqual([]);
  });

  it("lists granted ports with labels", async () => {
    const { port } = boardPort(defaultBoard, {
      info: { usbVendorId: 0x0483, usbProductId: 0x0029 },
    });
    installSerial([port]);
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.ports).toHaveLength(1));
    expect(result.current.ports[0]?.label).toBe("RRIV board 1");
  });

  it("connects a board picked in the browser prompt", async () => {
    const board = boardPort(defaultBoard);
    installSerial([], board.port);
    const { result } = renderConnection();
    await act(() => result.current.connectNew());
    expect(result.current.status).toBe("connected");
    expect(result.current.activePort).toBe(board.port);
  });

  it("does nothing when the browser prompt is dismissed", async () => {
    installSerial([], () => {
      throw new DOMException("No port selected", "NotFoundError");
    });
    const { result } = renderConnection();
    await act(() => result.current.connectNew());
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("surfaces an error when the port cannot open", async () => {
    const { port } = boardPort(defaultBoard, { failOpen: true });
    installSerial([port]);
    const { result } = renderConnection();
    await act(() => result.current.connect(port));
    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/boom/);
  });

  it("reads only the board's identity on connect, details on request", async () => {
    const { result, board } = await connectHook();
    expect(result.current.info?.serialNumber).toBe("SN-1");
    // Nothing else is read, or written, until the caller confirms ownership.
    expect(board.written).toEqual([{ object: "device", action: "get" }]);
    expect(result.current.boardVersion).toBeNull();
    expect(result.current.detailsRead).toBe(false);

    await act(() => result.current.refreshInfo());
    expect(result.current.boardVersion).toBe("1.0.0");
    expect(result.current.datalogger?.mode).toBe("interactive");
    // The telemeter is only asked when the user registers its EUIs.
    expect(board.written).not.toContainEqual({ object: "telemeter", action: "get" });
    expect(result.current.detailsRead).toBe(true);

    await act(() => result.current.syncClock());
    expect(result.current.clockSetAt).not.toBeNull();
    expect(board.written).toContainEqual(
      expect.objectContaining({ object: "board", action: "set", epoch: expect.any(Number) }),
    );

    await act(() => result.current.disconnect());
    expect(result.current.status).toBe("idle");
    expect(result.current.info).toBeNull();
  });

  it("records the serial transcript", async () => {
    const { result } = await connectHook();
    await waitFor(() =>
      expect(result.current.transcript.map((entry) => entry.direction)).toContain("rx"),
    );
    expect(result.current.transcript[0]).toMatchObject({
      direction: "tx",
      text: '{"object":"device","action":"get"}',
    });
  });

  it("marks the connection lost when the board is unplugged", async () => {
    const { result, board } = await connectHook();
    await act(async () => {
      board.unplug();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(result.current.status).toBe("lost"));
    expect(result.current.client).toBeNull();
    expect(result.current.error).toMatch(/disconnected/i);
  });

  it("reconnects automatically when a lost board reappears", async () => {
    const { result, board, serial } = await connectHook();
    await act(async () => {
      board.unplug();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(result.current.status).toBe("lost"));

    const replugged = boardPort(defaultBoard);
    await act(async () => serial.fire("connect", replugged.port as SerialPort));
    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.activePort).toBe(replugged.port);
  });

  it("collects watch frames, writes them to a sink, and stops cleanly", async () => {
    const { result, board } = await connectHook();
    const written: WatchFrame[] = [];
    let closed = false;
    const sink: WatchSink = {
      name: "watch.txt",
      write: async (frame) => void written.push(frame),
      close: async () => {
        closed = true;
      },
    };

    await act(() => result.current.startWatch({ sink }));
    expect(result.current.watching).toBe(true);
    expect(result.current.sinkName).toBe("watch.txt");

    await act(async () => {
      board.push("1,2,3");
      board.push('{"status":"ok"}');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(result.current.frames).toHaveLength(1));
    expect(result.current.frames[0]?.raw).toBe("1,2,3");
    expect(result.current.frameCount).toBe(1);
    expect(written.map((frame) => frame.raw)).toEqual(["1,2,3"]);

    await act(() => result.current.stopWatch());
    expect(result.current.watching).toBe(false);
    expect(closed).toBe(true);
    expect(board.written.at(-1)).toEqual({
      object: "datalogger",
      action: "set",
      mode: "interactive",
    });

    act(() => result.current.clearFrames());
    expect(result.current.frames).toEqual([]);
  });

  it("re-reads the board when it restarts on its own", async () => {
    const { result, board } = await connectHook();
    await act(() => result.current.refreshInfo());
    await act(() => result.current.syncClock());
    expect(result.current.detailsRead).toBe(true);

    await act(async () => {
      board.push('{"status":"datalogger-ready"}');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(result.current.restart?.kind).toBe("restart"));
    expect(result.current.detailsRead).toBe(false);
    expect(result.current.clockSetAt).toBeNull();

    act(() => result.current.dismissRestart());
    expect(result.current.restart).toBeNull();
  });

  it("explains a crash, waits for the board to boot, and reconnects", async () => {
    const { result, board, serial } = await connectHook();
    await act(async () => {
      board.push('{"status":"panic","message":"stack overflow"}');
      await new Promise((resolve) => setTimeout(resolve, 0));
      board.unplug();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(result.current.status).toBe("lost"));
    expect(result.current.error).toMatch(/crashed \(stack overflow\) and is restarting/);

    // The rebooted board answers nothing until it has said it's ready.
    let booted = false;
    const rebooted = boardPort((command) => (booted ? defaultBoard(command) : null));
    await act(async () => serial.fire("connect", rebooted.port as SerialPort));
    await waitFor(() => expect(result.current.waitingForBoot).toBe(true));
    // Nothing is sent to a board that is still booting.
    expect(rebooted.written).toEqual([]);

    await act(async () => {
      booted = true;
      rebooted.push('{"status":"datalogger-ready"}');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.waitingForBoot).toBe(false);
    expect(result.current.restart).toMatchObject({ kind: "crash", message: "stack overflow" });
  });

  it("waits out a traced start-up it asked for, showing its steps", async () => {
    const { result, board, serial } = await connectHook();
    await act(() =>
      result.current.sendRestarting({ object: "board", action: "diagnostic" }, "Tracing.", {
        traced: true,
      }),
    );
    await act(async () => {
      board.unplug();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(result.current.status).toBe("lost"));

    let booted = false;
    const tracing = boardPort((command) => (booted ? defaultBoard(command) : null));
    await act(async () => serial.fire("connect", tracing.port as SerialPort));
    await waitFor(() => expect(result.current.waitingForBoot).toBe(true));
    await act(async () => {
      tracing.push('{"startup":"i2c1"}');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(result.current.startupStep).toBe("i2c1"));
    // Nothing is sent to a board that is still starting.
    expect(tracing.written).toEqual([]);

    await act(async () => {
      booted = true;
      tracing.push('{"startup":"datalogger_setup","done":true}');
      tracing.push('{"status":"datalogger-ready"}');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.startupStep).toBeNull();
  });

  it("waits for a board it finds in the middle of a traced start-up", async () => {
    // e.g. the page was refreshed during a trace: no reply until it's started.
    let booted = false;
    const tracing = boardPort((command) => (booted ? defaultBoard(command) : null));
    installSerial([tracing.port]);
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.ports).toHaveLength(1));
    let connecting!: Promise<void>;
    await act(async () => {
      connecting = result.current.connect(tracing.port);
    });
    await act(async () => {
      tracing.push('{"startup":"external_adc"}');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // The first read times out (5 s); the trace line says to keep waiting.
    await waitFor(() => expect(result.current.waitingForBoot).toBe(true), { timeout: 8000 });
    await act(async () => {
      booted = true;
      tracing.push('{"status":"datalogger-ready"}');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(() => connecting);
    expect(result.current.status).toBe("connected");
  }, 20_000);

  it("recognises a board in update mode and starts its app", async () => {
    const board = boardPort(bootloaderBoard());
    const serial = installSerial([board.port]);
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.ports).toHaveLength(1));
    await act(() => result.current.connect(board.port));

    expect(result.current.status).toBe("bootloader");
    expect(result.current.error).toBeNull();
    expect(result.current.info).toBeNull();
    expect(result.current.bootloader).toEqual({
      version: "0.3.0",
      appValid: true,
      appVersion: "1.15.0",
      appError: null,
      startupLoop: null,
    });
    expect(result.current.client).not.toBeNull();

    await act(() => result.current.startApp());
    expect(board.written).toContainEqual({ object: "bootloader", action: "boot" });
    // The bootloader resets into the app: the port drops and comes back.
    await act(async () => {
      board.unplug();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(result.current.status).toBe("lost"));
    expect(result.current.error).toMatch(/Starting the app/);
    expect(result.current.bootloader).toBeNull();

    const app = boardPort(defaultBoard);
    await act(async () => serial.fire("connect", app.port as SerialPort));
    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.info?.serialNumber).toBe("SN-1");
  });

  it("installs firmware across the restarts into the bootloader and back", async () => {
    const { result, board, serial } = await connectHook();
    const image = parseFirmwareImage(signedImage("2.0.0", 1300));

    await act(() => result.current.installFirmware(image));
    expect(board.written).toContainEqual({ object: "board", action: "bootloader" });
    expect(result.current.firmware).toEqual({ stage: "restarting", version: "2.0.0" });

    // The app resets into the bootloader...
    await act(async () => {
      board.unplug();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(result.current.status).toBe("lost"));
    expect(result.current.error).toMatch(/Restarting into update mode/);

    // ...which comes back, takes the image and is told to start it.
    const respond = bootloaderBoard();
    const loader = boardPort(respond);
    await act(async () => serial.fire("connect", loader.port as SerialPort));
    await waitFor(() => expect(result.current.firmware?.stage).toBe("starting"));
    expect(Uint8Array.from(respond.received)).toEqual(image.bytes);
    expect(loader.written.at(-1)).toEqual({ object: "bootloader", action: "boot" });

    await act(async () => {
      loader.unplug();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(result.current.status).toBe("lost"));
    const app = boardPort(defaultBoard);
    await act(async () => serial.fire("connect", app.port as SerialPort));
    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.firmware).toEqual({
      stage: "done",
      version: "2.0.0",
      installedAt: expect.any(String),
    });
  });

  it("doesn't write a release that needs a newer bootloader, and goes back to the app", async () => {
    const { result, board, serial } = await connectHook();
    const image = { ...parseFirmwareImage(signedImage("2.0.0", 1300)), minBootloader: "1.0.0" };

    await act(() => result.current.installFirmware(image));
    await act(async () => {
      board.unplug();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(result.current.status).toBe("lost"));

    // The bootloader (0.3.0) is too old: nothing is written, and it's told to
    // start the app it already has.
    const respond = bootloaderBoard();
    const loader = boardPort(respond);
    await act(async () => serial.fire("connect", loader.port as SerialPort));
    await waitFor(() => expect(result.current.firmware?.stage).toBe("error"));
    expect(result.current.firmware).toMatchObject({
      message: expect.stringMatching(/^2\.0\.0 needs bootloader 1\.0\.0 or newer; this board has 0\.3\.0\. Its firmware wasn't changed\./),
    });
    expect(loader.written.map((command) => command.action)).not.toContain("begin");
    expect(respond.received).toHaveLength(0);
    expect(loader.written.at(-1)).toEqual({ object: "bootloader", action: "boot" });
  });

  it("installs a release whose minimum the bootloader meets", async () => {
    const respond = bootloaderBoard(true);
    const loader = boardPort(respond);
    installSerial([loader.port]);
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.ports).toHaveLength(1));
    await act(() => result.current.connect(loader.port));

    const image = { ...parseFirmwareImage(signedImage("2.0.0", 700)), minBootloader: "0.3.0" };
    await act(() => result.current.installFirmware(image));
    expect(result.current.firmware?.stage).toBe("starting");
    expect(Uint8Array.from(respond.received)).toEqual(image.bytes);
  });

  it("reports an image the bootloader refuses, and stays in update mode", async () => {
    const respond = bootloaderBoard(false, { refuse: "hash_mismatch" });
    const loader = boardPort(respond);
    installSerial([loader.port]);
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.ports).toHaveLength(1));
    await act(() => result.current.connect(loader.port));
    expect(result.current.status).toBe("bootloader");

    await act(() => result.current.installFirmware(parseFirmwareImage(signedImage("2.0.0", 700))));
    expect(result.current.firmware).toMatchObject({
      stage: "error",
      message: expect.stringMatching(/image refused: hash_mismatch/),
    });
    expect(result.current.status).toBe("bootloader");
    expect(loader.written).not.toContainEqual({ object: "bootloader", action: "boot" });
  });

  it("refuses a damaged image without restarting the board", async () => {
    const { result, board } = await connectHook();
    const bytes = signedImage("2.0.0", 700);
    bytes[900]! ^= 0xff;

    await act(() => result.current.installFirmware(parseFirmwareImage(bytes)));

    expect(result.current.firmware).toMatchObject({
      stage: "error",
      message: expect.stringMatching(/damaged/),
    });
    expect(board.written).not.toContainEqual({ object: "board", action: "bootloader" });
    expect(result.current.status).toBe("connected");
  });

  it("refuses a damaged image in update mode before sending anything", async () => {
    const respond = bootloaderBoard(true);
    const loader = boardPort(respond);
    installSerial([loader.port]);
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.ports).toHaveLength(1));
    await act(() => result.current.connect(loader.port));
    const bytes = signedImage("2.0.0", 700);
    bytes[900]! ^= 0xff;

    await act(() => result.current.installFirmware(parseFirmwareImage(bytes)));

    expect(result.current.firmware).toMatchObject({ stage: "error" });
    expect(loader.written).not.toContainEqual(expect.objectContaining({ action: "begin" }));
    expect(result.current.status).toBe("bootloader");
  });

  it("explains an image signed for another bootloader, refused before anything is erased", async () => {
    const respond = bootloaderBoard(true, { refuseHeader: "bad_signature" });
    const loader = boardPort(respond);
    installSerial([loader.port]);
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.ports).toHaveLength(1));
    await act(() => result.current.connect(loader.port));

    await act(() => result.current.installFirmware(parseFirmwareImage(signedImage("2.0.0", 700))));
    expect(result.current.firmware).toMatchObject({
      stage: "error",
      message: expect.stringMatching(/^Image not signed for this board\.$/),
    });
    expect(respond.received).toHaveLength(0);
    expect(loader.written.filter((command) => command.action === "write")).toHaveLength(1);
  });
});
