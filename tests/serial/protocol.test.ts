import { describe, expect, it } from "vitest";
import {
  SerialClient,
  SerialCrashError,
  SerialError,
  parseBoardStatus,
  readDevice,
} from "@/serial";
import { deliver, FakeTransport } from "./fakeTransport";

const ECHO_DEVICE = '{"object":"device","action":"get"}';

function makeClient(timeoutMs = 200) {
  const transport = new FakeTransport();
  const client = new SerialClient(transport, {
    timeoutMs,
    retryDelayMs: 1,
    resyncMs: 30,
  });
  client.start();
  return { transport, client };
}

describe("SerialClient", () => {
  it("skips the command echo and parses the response", async () => {
    const { transport, client } = makeClient();
    const promise = readDevice(client);
    await deliver(transport, [ECHO_DEVICE, '{"serial_number":"SN-1","uid":"U-1"}']);

    await expect(promise).resolves.toEqual({
      serialNumber: "SN-1",
      uid: "U-1",
      codes: [],
    });
    expect(transport.written).toEqual([ECHO_DEVICE]);
    await client.stop();
  });

  it("ignores non-JSON overflow lines", async () => {
    const { transport, client } = makeClient();
    const promise = readDevice(client);
    await deliver(transport, [ECHO_DEVICE, "1,2,3", '{"uid":"U-2"}']);

    await expect(promise).resolves.toMatchObject({ uid: "U-2" });
    await client.stop();
  });

  it("retries after the board reboots (datalogger-ready)", async () => {
    const { transport, client } = makeClient();
    const promise = readDevice(client);
    await deliver(transport, [ECHO_DEVICE, '{"status":"datalogger-ready"}']);
    await deliver(transport, [ECHO_DEVICE, '{"uid":"U-3"}']);

    await expect(promise).resolves.toMatchObject({ uid: "U-3" });
    expect(transport.written).toHaveLength(2);
    await client.stop();
  });

  it("rejects when the device reports an error", async () => {
    const { transport, client } = makeClient();
    const promise = readDevice(client);
    await deliver(transport, [ECHO_DEVICE, '{"error":"bad command"}']);

    await expect(promise).rejects.toBeInstanceOf(SerialError);
    await client.stop();
  });

  it("times out when the board does not answer", async () => {
    const { client } = makeClient(20);
    await expect(readDevice(client)).rejects.toThrow(/Timed out/);
    await client.stop();
  });

  it("serializes concurrent commands", async () => {
    const { transport, client } = makeClient();
    const first = client.send({ object: "device", action: "get" });
    const second = client.send({ object: "telemeter", action: "get" });
    await deliver(transport, ['{"n":1}']);
    await deliver(transport, ['{"n":2}']);

    await expect(first).resolves.toEqual({ n: 1 });
    await expect(second).resolves.toEqual({ n: 2 });
    await client.stop();
  });

  it("fails pending work when the connection closes", async () => {
    const { transport, client } = makeClient();
    const promise = readDevice(client);
    await transport.close();
    await expect(promise).rejects.toBeInstanceOf(SerialError);
  });

  it("writes without waiting for a response", async () => {
    const { transport, client } = makeClient();
    await client.write({ object: "datalogger", action: "set", mode: "watch" });
    expect(transport.written).toEqual([
      '{"object":"datalogger","action":"set","mode":"watch"}',
    ]);
    await client.stop();
  });

  it("rejects the board's status:error replies even when error is empty", async () => {
    const { transport, client } = makeClient();
    const promise = client.send({ object: "sensor", action: "remove", id: "x" });
    await deliver(transport, [
      '{"object":"sensor","action":"remove","id":"x"}',
      '{"status":"error","message":"sensor not found","error":""}',
    ]);

    await expect(promise).rejects.toThrow("sensor not found");
    await client.stop();
  });

  it("keeps a reply that arrives in the same chunk as its echo", async () => {
    const { transport, client } = makeClient();
    const promise = readDevice(client);
    await new Promise((resolve) => setTimeout(resolve, 5));
    transport.push(ECHO_DEVICE);
    transport.push('{"uid":"U-4"}');

    await expect(promise).resolves.toMatchObject({ uid: "U-4" });
    await client.stop();
  });

  it("does not hand a late reply to the next command", async () => {
    const { transport, client } = makeClient(20);
    await expect(readDevice(client)).rejects.toThrow(/Timed out/);

    const next = client.send({ object: "telemeter", action: "get" });
    // The first command's reply turns up late, during the resync pause.
    transport.push('{"uid":"stale"}');
    await new Promise((resolve) => setTimeout(resolve, 40));
    await deliver(transport, ['{"dev_eui":"D"}']);

    await expect(next).resolves.toEqual({ dev_eui: "D" });
    await client.stop();
  });

  it("returns the first non-echo line verbatim from sendRaw", async () => {
    const { transport, client } = makeClient();
    const promise = client.sendRaw({ object: "sensor", action: "calibrate", id: "t" });
    await deliver(transport, [
      '{"object":"sensor","action":"calibrate","id":"t"}',
      "{ pairs: []}",
    ]);

    await expect(promise).resolves.toBe("{ pairs: []}");
    await client.stop();
  });

  it("reports every line it writes and receives", async () => {
    const transport = new FakeTransport();
    const sent: string[] = [];
    const received: string[] = [];
    const client = new SerialClient(transport, {
      onWrite: (line) => sent.push(line),
      onLine: (line) => received.push(line),
    });
    client.start();
    const promise = readDevice(client);
    await deliver(transport, [ECHO_DEVICE, '{"uid":"U"}']);
    await promise;

    expect(sent).toEqual([ECHO_DEVICE]);
    expect(received).toEqual([ECHO_DEVICE, '{"uid":"U"}']);
    await client.stop();
  });

  it("settles closed when the transport ends", async () => {
    const { transport, client } = makeClient();
    await transport.close();
    await expect(client.closed).resolves.toBeUndefined();
  });

  it("does not resend a command after the board crashes", async () => {
    const { transport, client } = makeClient();
    const promise = readDevice(client);
    await deliver(transport, [ECHO_DEVICE, '{"status":"panic","message":"oops"}']);

    const error = await promise.catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(SerialCrashError);
    expect((error as SerialCrashError).message).toMatch(/crashed \(oops\) and is restarting/);
    expect(transport.written).toHaveLength(1);
    await client.stop();
  });

  it("waits for a matching line", async () => {
    const { transport, client } = makeClient();
    const waiting = client.waitForLine((line) => line.includes("ready"), 200);
    await deliver(transport, ["noise", '{"status":"datalogger-ready"}']);
    await expect(waiting).resolves.toBe(true);
    await client.stop();
  });

  it("stops waiting on timeout or close", async () => {
    const { transport, client } = makeClient();
    await expect(client.waitForLine(() => false, 10)).resolves.toBe(false);
    const waiting = client.waitForLine(() => false, 1000);
    await transport.close();
    await expect(waiting).resolves.toBe(false);
  });
});

describe("parseBoardStatus", () => {
  it("recognises ready and panic lines", () => {
    expect(parseBoardStatus('{"status":"datalogger-ready"}')).toEqual({ kind: "ready" });
    expect(parseBoardStatus('{"status":"panic","message":"boom"}')).toEqual({
      kind: "panic",
      message: "boom",
    });
  });

  it("ignores everything else", () => {
    expect(parseBoardStatus('{"status":"error","message":"x"}')).toBeNull();
    expect(parseBoardStatus("1,2,3")).toBeNull();
    expect(parseBoardStatus('{"status":"panic","message":"torn')).toBeNull();
  });
});
