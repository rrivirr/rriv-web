import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import {
  numericSeriesKeys,
  toChartData,
  useReadings,
} from "@/api/readings";
import { hookWrapper } from "../helpers/render";
import { server } from "../helpers/server";

const readingsUrl = "http://api.test/device/:id/readings";

describe("numericSeriesKeys", () => {
  it("collects numeric and numeric-string channels, sorted naturally", () => {
    const keys = numericSeriesKeys([
      { timestamp: "2026-01-01T00:00:00Z", temperature: 5, "ph-2": "7.1" },
      { timestamp: "2026-01-01T01:00:00Z", temperature: "6", ph: 7.2, note: "x" },
    ]);
    expect(keys).toEqual(["ph", "ph-2", "temperature"]);
  });

  it("ignores the timestamp and non-numeric values", () => {
    expect(
      numericSeriesKeys([{ timestamp: "2026-01-01T00:00:00Z", note: "hi" }]),
    ).toEqual([]);
    expect(
      numericSeriesKeys([{ timestamp: "2026-01-01T00:00:00Z", empty: "" }]),
    ).toEqual([]);
  });
});

describe("toChartData", () => {
  it("maps rows to points with null gaps and sorts by time", () => {
    const data = toChartData(
      [
        { timestamp: "2026-01-01T02:00:00Z", a: "2" },
        { timestamp: "2026-01-01T01:00:00Z", a: 1, b: 9 },
      ],
      ["a", "b"],
    );
    expect(data.map((p) => p.a)).toEqual([1, 2]);
    expect(data[0]).toEqual({ t: Date.parse("2026-01-01T01:00:00Z"), a: 1, b: 9 });
    expect(data[1]?.b).toBeNull();
  });

  it("drops rows with an unparseable timestamp", () => {
    expect(
      toChartData([{ timestamp: "not-a-date", a: 1 }], ["a"]),
    ).toEqual([]);
  });
});

describe("useReadings", () => {
  const range = { start: new Date("2026-01-01T00:00:00Z") };

  it("is disabled without a device, a range, or when told to wait", () => {
    for (const [deviceId, r, enabled] of [
      [undefined, range, true],
      ["d1", null, true],
      ["d1", range, false],
    ] as const) {
      const { result } = renderHook(
        () => useReadings(deviceId, r, { enabled }),
        { wrapper: hookWrapper() },
      );
      expect(result.current.fetchStatus).toBe("idle");
    }
  });

  it("reads from rriv-api by device, with the user's token", async () => {
    let request: Request | undefined;
    server.use(
      http.get(readingsUrl, ({ request: incoming, params }) => {
        request = incoming;
        expect(params.id).toBe("d1");
        return HttpResponse.json([
          { timestamp: "2026-01-01T00:30:00Z", temperature: 4 },
        ]);
      }),
    );

    const { result } = renderHook(() => useReadings("d1", range), {
      wrapper: hookWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(request?.headers.get("authorization")).toBe("Bearer test-token");
    const search = new URL(request!.url).searchParams;
    expect(search.get("rangeStart")).toBe("2026-01-01T00:00:00.000Z");
    expect(search.get("format")).toBe("json");
    expect(search.has("limit")).toBe(false);
  });

  it("adds rangeEnd and surfaces API errors", async () => {
    let search = "";
    server.use(
      http.get(readingsUrl, ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json({ message: "unavailable" }, { status: 503 });
      }),
    );

    const { result } = renderHook(
      () =>
        useReadings("d1", {
          start: range.start,
          end: new Date("2026-01-01T06:00:00Z"),
        }),
      { wrapper: hookWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(search).toContain("rangeEnd=");
  });
});
