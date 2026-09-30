import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import {
  useActiveConfig,
  useConfigHistory,
  useDeviceLogs,
  useFirmwareHistory,
} from "@/api/configs";
import { hookWrapper } from "../helpers/render";
import { server } from "../helpers/server";

const api = "http://api.test";

describe("useActiveConfig", () => {
  it("stays idle unless enabled with both ids", () => {
    const get = vi.fn();
    server.use(http.get(`${api}/configSnapshot/active`, get));

    const { result } = renderHook(
      () => useActiveConfig("d1", "c1", false),
      { wrapper: hookWrapper() },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });

  it("loads the active config when enabled", async () => {
    let search = "";
    server.use(
      http.get(`${api}/configSnapshot/active`, ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json({ dataloggerConfig: null, sensorConfig: [] });
      }),
    );

    const { result } = renderHook(() => useActiveConfig("d1", "c1", true), {
      wrapper: hookWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(search).toContain("deviceId=d1");
    expect(search).toContain("contextId=c1");
  });
});

describe("useConfigHistory", () => {
  it("requests ascending history for an identifier", async () => {
    let search = "";
    server.use(
      http.get(`${api}/configSnapshot/history`, ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json({ dataloggerConfigs: [], sensorConfigs: [] });
      }),
    );

    const { result } = renderHook(() => useConfigHistory("S1"), {
      wrapper: hookWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(search).toContain("deviceIdentifier=S1");
    expect(search).toContain("order=asc");
  });

  it("stays idle without an identifier", () => {
    const get = vi.fn();
    server.use(http.get(`${api}/configSnapshot/history`, get));

    const { result } = renderHook(() => useConfigHistory(undefined), {
      wrapper: hookWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });
});

describe("useFirmwareHistory", () => {
  it("passes a deviceId", async () => {
    let search = "";
    server.use(
      http.get(`${api}/device/firmware/history`, ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json([]);
      }),
    );

    const { result } = renderHook(
      () => useFirmwareHistory({ deviceId: "d1" }),
      { wrapper: hookWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(search).toContain("deviceId=d1");
  });

  it("passes a serialNumber", async () => {
    let search = "";
    server.use(
      http.get(`${api}/device/firmware/history`, ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json([]);
      }),
    );

    const { result } = renderHook(
      () => useFirmwareHistory({ serialNumber: "S1" }),
      { wrapper: hookWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(search).toContain("serialNumber=S1");
  });
});

describe("useDeviceLogs", () => {
  it("loads logs for an identifier", async () => {
    server.use(
      http.get(`${api}/device/log`, () =>
        HttpResponse.json([
          { log: "checked", createdAt: "2026-01-01T00:00:00Z" },
        ]),
      ),
    );

    const { result } = renderHook(() => useDeviceLogs("S1"), {
      wrapper: hookWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.log).toBe("checked");
  });
});
