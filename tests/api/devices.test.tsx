import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { useDevice, useDevices } from "@/api/devices";
import type { Device } from "@/api/types";
import { hookWrapper } from "../helpers/render";
import { server } from "../helpers/server";

const devicesUrl = "http://api.test/device";

const device: Device = {
  id: "d1",
  serialNumber: "S1",
  uniqueName: "well-a",
  createdAt: "2026-01-01T00:00:00Z",
};

describe("useDevices", () => {
  it("serializes filters into the query string", async () => {
    let search = "";
    server.use(
      http.get(devicesUrl, ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json([device]);
      }),
    );

    const { result } = renderHook(
      () => useDevices({ search: "well", limit: 10 }),
      { wrapper: hookWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(search).toContain("search=well");
    expect(search).toContain("limit=10");
    expect(result.current.data).toEqual([device]);
  });

  it("works with no filters", async () => {
    let search: string | undefined;
    server.use(
      http.get(devicesUrl, ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json([]);
      }),
    );

    const { result } = renderHook(() => useDevices(), {
      wrapper: hookWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(search).toBe("");
  });
});

describe("useDevice", () => {
  it("selects the first matching device", async () => {
    server.use(http.get(devicesUrl, () => HttpResponse.json([device])));

    const { result } = renderHook(() => useDevice("d1"), {
      wrapper: hookWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe("d1");
  });

  it("returns null when the API has no match", async () => {
    server.use(http.get(devicesUrl, () => HttpResponse.json([])));

    const { result } = renderHook(() => useDevice("missing"), {
      wrapper: hookWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("stays idle without an id", () => {
    const get = vi.fn();
    server.use(http.get(devicesUrl, get));

    const { result } = renderHook(() => useDevice(undefined), {
      wrapper: hookWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });
});
