import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadCsv,
  frameToLogLine,
  framesToCsv,
  framesToLog,
  watchFilename,
  type WatchFrame,
} from "@/serial";

const frames: WatchFrame[] = [
  { receivedAt: "2026-01-01T00:00:00.000Z", raw: "1,2,3" },
  { receivedAt: "2026-01-01T00:00:01.000Z", raw: 'a,"b,c"' },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("watch", () => {
  it("formats a log line like the CLI", () => {
    expect(frameToLogLine(frames[0]!)).toBe("2026-01-01T00:00:00.000Z,1,2,3");
  });

  it("serialises frames to CSV with a header and escaping", () => {
    expect(framesToCsv(frames)).toBe(
      'received_at,data\n' +
        '2026-01-01T00:00:00.000Z,"1,2,3"\n' +
        '2026-01-01T00:00:01.000Z,"a,""b,c"""\n',
    );
  });

  it("downloads a CSV blob and revokes the URL", () => {
    const createObjectURL = vi.fn(() => "blob:x");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(() => {}, { createObjectURL, revokeObjectURL }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    downloadCsv("watch.csv", "a,b\n");

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });

  it("writes the CLI's log format", () => {
    expect(framesToLog(frames)).toBe(
      "2026-01-01T00:00:00.000Z,1,2,3\n" + '2026-01-01T00:00:01.000Z,a,"b,c"\n',
    );
  });

  it("names files like the CLI", () => {
    expect(watchFilename("rriv", new Date(2026, 0, 2, 3, 4))).toBe(
      "rriv_2026-01-02T03-04_watch.txt",
    );
  });
});
