import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./client";

/**
 * `GET /firmware/releases`: rriv-firmware releases with a signed image, newest
 * first. rriv-api serves the images because the browser can't download
 * GitHub release files (no CORS).
 */
export interface FirmwareRelease {
  /** Release tag; also the version the board reports once it's installed. */
  version: string;
  name: string;
  publishedAt: string | null;
  prerelease: boolean;
  notes: string;
  /** The bootloader built with this release. */
  bootloaderVersion: string | null;
  /** The oldest bootloader this release works with; null: no requirement. */
  minBootloader: string | null;
  /** Whether the board's bootloader is new enough, when it was given. */
  compatible?: boolean;
  size: number;
}

/**
 * The releases; given the board's bootloader version (in update mode, from
 * its `info` reply), rriv-api marks each one `compatible` or not.
 */
export function useFirmwareReleases(bootloader?: string | null) {
  const api = useApiClient();
  // rriv-api only takes x.y.z; anything else lists the releases unmarked.
  const known = bootloader && /^\d+\.\d+\.\d+$/.test(bootloader) ? bootloader : null;
  return useQuery({
    queryKey: ["firmware-releases", known],
    queryFn: ({ signal }) =>
      api.get<FirmwareRelease[]>(
        known ? `/firmware/releases?bootloader=${encodeURIComponent(known)}` : "/firmware/releases",
        { signal },
      ),
    staleTime: 5 * 60 * 1000,
  });
}

/** Download a release's signed image. */
export function useDownloadFirmware() {
  const api = useApiClient();
  return useCallback(
    (version: string) =>
      api.getBytes(`/firmware/releases/${encodeURIComponent(version)}/image`),
    [api],
  );
}
