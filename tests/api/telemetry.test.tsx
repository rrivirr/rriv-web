import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import {
  numericSeriesKeys,
  toChartData,
  useReadings,
} from "@/api/telemetry";
import { hookWrapper } from "../helpers/render";
import { server } from "../helpers/server";

const readingsUrl = "http://data.test/readings";

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

  it("is disabled without an EUI or range", () => {
    const { result } = renderHook(() => useReadings(undefined, range), {
      wrapper: hookWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("falls back through EUI casings until it finds readings", async () => {
    server.use(
      http.get(`${readingsUrl}/:eui`, ({ params }) => {
        const eui = String(params.eui);
        // Only the lower-cased variant has data.
        return eui === eui.toLowerCase()
          ? HttpResponse.json([
              { timestamp: "2026-01-01T00:30:00Z", temperature: 4 },
            ])
          : HttpResponse.json([]);
      }),
    );

    const { result } = renderHook(() => useReadings("ABC", range), {
      wrapper: hookWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.eui).toBe("abc");
    expect(result.current.data?.readings).toHaveLength(1);
  });

  it("adds rangeEnd and surfaces data-api errors", async () => {
    let search = "";
    server.use(
      http.get(`${readingsUrl}/abc`, ({ request }) => {
        search = new URL(request.url).search;
        return new HttpResponse(null, { status: 503 });
      }),
    );

    const { result } = renderHook(
      () =>
        useReadings("abc", {
          start: range.start,
          end: new Date("2026-01-01T06:00:00Z"),
        }),
      { wrapper: hookWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(search).toContain("rangeEnd=");
    expect(search).toContain("format=json");
  });
});
