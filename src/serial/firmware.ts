import { type SerialClient, SerialError } from "./protocol";

/**
 * Signed firmware images and the bootloader's install commands
 * (`begin` / `write` / `finish`). The image format and commands are defined in
 * rriv-firmware's `board/rriv_boot` (`image.rs`, `protocol.rs`).
 */

export const IMAGE_HEADER_SIZE = 512;
/** Bytes per `write`; the bootloader accepts up to 512. */
export const BLOCK_SIZE = 512;
const HASH_OFFSET = 48;

export interface FirmwareImage {
  bytes: Uint8Array;
  /** Firmware version from the header. */
  version: string;
  /** App size in bytes, header excluded. */
  appSize: number;
  /**
   * The oldest bootloader the image works with, from the release it came
   * from (rriv-api); not in the header, so unknown for a file from disk.
   */
  minBootloader?: string | null;
}

const versionParts = (version: string | null) => {
  const match = version ? /^(\d+)\.(\d+)\.(\d+)$/.exec(version) : null;
  return match ? match.slice(1).map(Number) : null;
};

/**
 * Whether bootloader `version` (from its `info` reply) is older than `minimum`
 * (both `x.y.z`). A version that can't be read counts as too old: the
 * requirement can't be confirmed.
 */
export function bootloaderTooOld(version: string | null, minimum: string): boolean {
  const have = versionParts(version);
  const need = versionParts(minimum);
  if (!have || !need) return true;
  const index = have.findIndex((part, i) => part !== need[i]);
  return index !== -1 && have[index] < need[index];
}

/**
 * Read a signed image's header. This only checks the format; `imageIntact`
 * checks the hash, and the bootloader checks the signature when the first
 * block (the header) arrives and the hash again at `finish`.
 */
export function parseFirmwareImage(bytes: Uint8Array): FirmwareImage {
  const notSigned = "This isn't a signed RRIV firmware image (.bin from rriv_image sign).";
  if (bytes.length <= IMAGE_HEADER_SIZE) throw new Error(notSigned);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== "RRIV") throw new Error(notSigned);
  if (view.getUint16(4, true) !== 1 || view.getUint16(6, true) !== IMAGE_HEADER_SIZE) {
    throw new Error("This image uses a header format this page doesn't know.");
  }
  const appSize = view.getUint32(8, true);
  if (appSize !== bytes.length - IMAGE_HEADER_SIZE) {
    throw new Error("This image is incomplete or has extra bytes: its size doesn't match its header.");
  }
  const versionBytes = bytes.subarray(16, 48);
  const end = versionBytes.indexOf(0);
  const version = String.fromCharCode(...versionBytes.subarray(0, end === -1 ? 32 : end));
  return { bytes, version, appSize };
}

/**
 * Whether the image matches the SHA-256 in its header. The bootloader only
 * finds out at `finish`, after replacing the installed firmware, so this runs
 * before the board is touched.
 */
export async function imageIntact({ bytes }: FirmwareImage): Promise<boolean> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes.subarray(IMAGE_HEADER_SIZE) as BufferSource),
  );
  const expected = bytes.subarray(HASH_OFFSET, HASH_OFFSET + digest.length);
  return digest.every((byte, i) => byte === expected[i]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** Standard CRC-32 (as zlib computes it), which `write` checks each block with. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** Why the bootloader refused an image's header, before erasing anything. */
const HEADER_REFUSALS: Record<string, string> = {
  bad_signature: "Image not signed for this board.",
  bad_size: "Image size doesn't match its header.",
  unsupported_header: "Image needs a newer bootloader.",
  no_header: "Not a signed RRIV image.",
};

function explainHeaderRefusal(cause: unknown): never {
  const code = cause instanceof SerialError ? cause.response?.error : undefined;
  const refusal = typeof code === "string" ? HEADER_REFUSALS[code] : undefined;
  if (refusal) throw new Error(refusal);
  throw cause;
}

/**
 * Install `image` on a board that is in the bootloader: `begin`, every block
 * with `write`, then `finish` (the bootloader checks the image). The first
 * block is the header, whose signature the bootloader checks before erasing
 * anything. Resolves with the installed version. The board stays in the
 * bootloader; start the app afterwards.
 */
export async function installFirmware(
  client: SerialClient,
  image: FirmwareImage,
  onProgress: (written: number, total: number) => void,
): Promise<string> {
  const total = image.bytes.length;
  await client.send({ object: "bootloader", action: "begin", size: total });
  for (let offset = 0; offset < total; offset += BLOCK_SIZE) {
    const block = image.bytes.subarray(offset, offset + BLOCK_SIZE);
    const write = client.send({
      object: "bootloader",
      action: "write",
      offset,
      data: toBase64(block),
      crc: crc32(block),
    });
    await (offset === 0 ? write.catch(explainHeaderRefusal) : write);
    onProgress(offset + block.length, total);
  }
  const done = await client.send({ object: "bootloader", action: "finish" });
  return typeof done.app_version === "string" ? done.app_version : image.version;
}
