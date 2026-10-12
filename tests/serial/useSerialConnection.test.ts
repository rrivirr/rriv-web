import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { type SerialPort, type WatchFrame, type WatchSink, useSerialConnection } from "@/serial";
import { hookWrapper } from "../helpers/render";
import { boardPort, defaultBoard, installSerial, uninstallSerial } from "./fakeBoard";

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
});

