import { describe, expect, it, vi } from "vitest";
import {
  type SerialClient,
  SerialError,
  bootloaderTooOld,
  crc32,
  imageIntact,
  installFirmware,
  parseFirmwareImage,
} from "@/serial";
import { signedImage } from "./fakeBoard";

describe("firmware images", () => {
  it("reads a signed image's header", () => {
    const image = parseFirmwareImage(signedImage("1.15.0", 1300));
    expect(image.version).toBe("1.15.0");
    expect(image.appSize).toBe(1300);
  });

  it("rejects files that aren't signed images", () => {
    expect(() => parseFirmwareImage(new Uint8Array(1000))).toThrow(/isn't a signed RRIV firmware/);
    const truncated = signedImage("1.15.0", 1300).subarray(0, 1000);
    expect(() => parseFirmwareImage(truncated)).toThrow(/size doesn't match/);
    const unknown = signedImage("1.15.0", 1300);
    unknown[4] = 2;
    expect(() => parseFirmwareImage(unknown)).toThrow(/header format/);
  });

  it("checks an image against the hash in its header", async () => {
    const bytes = signedImage("1.15.0", 1300);
    await expect(imageIntact(parseFirmwareImage(bytes))).resolves.toBe(true);
    bytes[1000]! ^= 0xff;
    await expect(imageIntact(parseFirmwareImage(bytes))).resolves.toBe(false);
  });

  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("installs with begin, ordered 512-byte writes and finish", async () => {
    const image = parseFirmwareImage(signedImage("1.15.0", 1300));
    const sent: Record<string, unknown>[] = [];
    const client = {
      send: vi.fn(async (command: Record<string, unknown>) => {
        sent.push(command);
        return command.action === "finish" ? { message: "installed", app_version: "1.15.0" } : {};
      }),
    } as unknown as SerialClient;
    const progress: number[] = [];

    await expect(installFirmware(client, image, (written) => progress.push(written))).resolves.toBe(
      "1.15.0",
    );
    expect(sent[0]).toEqual({ object: "bootloader", action: "begin", size: 1812 });
    const writes = sent.filter((command) => command.action === "write");
    expect(writes.map((command) => command.offset)).toEqual([0, 512, 1024, 1536]);
    const last = image.bytes.subarray(1536);
    expect(writes[3]).toMatchObject({ crc: crc32(last), data: btoa(String.fromCharCode(...last)) });
    expect(sent.at(-1)).toEqual({ object: "bootloader", action: "finish" });
    expect(progress).toEqual([512, 1024, 1536, 1812]);
  });

  it("explains a header the bootloader refuses and stops there", async () => {
    const image = parseFirmwareImage(signedImage("1.15.0", 1300));
    const sent: Record<string, unknown>[] = [];
    const client = {
      send: vi.fn(async (command: Record<string, unknown>) => {
        sent.push(command);
        if (command.action !== "write") return {};
        const reply = { status: "error", message: "image refused", error: "bad_signature" };
        throw new SerialError("image refused", reply);
      }),
    } as unknown as SerialClient;

    await expect(installFirmware(client, image, () => undefined)).rejects.toThrow(
      /^Image not signed for this board\.$/,
    );
    expect(sent.map((command) => command.action)).toEqual(["begin", "write"]);
  });

  it("compares bootloader versions as numbers", () => {
    expect(bootloaderTooOld("1.0.0", "1.0.0")).toBe(false);
    expect(bootloaderTooOld("1.10.0", "1.9.0")).toBe(false);
    expect(bootloaderTooOld("2.0.0", "1.9.9")).toBe(false);
    expect(bootloaderTooOld("1.9.0", "1.10.0")).toBe(true);
    expect(bootloaderTooOld("0.4.1", "1.0.0")).toBe(true);
    // Can't be confirmed: counts as too old.
    expect(bootloaderTooOld(null, "1.0.0")).toBe(true);
    expect(bootloaderTooOld("dev", "1.0.0")).toBe(true);
  });
});
