import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { useLibraryConfig, useLibraryConfigs } from "@/api/library";
import { hookWrapper } from "../helpers/render";
import { server } from "../helpers/server";

const api = "http://api.test";

describe("useLibraryConfigs", () => {
  it("serializes library filters", async () => {
    let search = "";
    server.use(
      http.get(`${api}/sensor/libraryConfig`, ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json([]);
      }),
    );

    const { result } = renderHook(
      () =>
        useLibraryConfigs("sensor", {
          search: "ph",
          isPublic: true,
          orderBy: "name",
          order: "asc",
          limit: 24,
          offset: 0,
        }),
      { wrapper: hookWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(search).toContain("search=ph");
    expect(search).toContain("isPublic=true");
    expect(search).toContain("orderBy=name");
    expect(search).toContain("order=asc");
  });

  it("omits empty strings and undefined values", async () => {
    let search: string | undefined;
    server.use(
      http.get(`${api}/datalogger/libraryConfig`, ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json([]);
      }),
    );

    const { result } = renderHook(
      () =>
        useLibraryConfigs("datalogger", {
          search: "   ",
          author: undefined,
          limit: 24,
        }),
      { wrapper: hookWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(search).toBe("?limit=24");
  });
});

describe("useLibraryConfig", () => {
  it("loads a detail by id", async () => {
    server.use(
      http.get(`${api}/configSnapshot/libraryConfig/x1`, () =>
        HttpResponse.json({
          id: "x1",
          name: "deployment",
          createdAt: "2026-01-01T00:00:00Z",
          SystemLibraryConfigVersion: [{ version: 1 }],
        }),
      ),
    );

    const { result } = renderHook(() => useLibraryConfig("system", "x1"), {
      wrapper: hookWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe("deployment");
  });

  it("stays idle without an id", () => {
    const { result } = renderHook(() => useLibraryConfig("sensor", undefined), {
      wrapper: hookWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
  });
});
