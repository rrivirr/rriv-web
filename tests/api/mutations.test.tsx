import { renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import {
  useBindDevice,
  useCreateContext,
  useCreateDeviceContext,
  useCreateDeviceLog,
  useDeleteContext,
  useDeleteDevice,
  useSaveSnapshot,
  useSendCommand,
  useShareContext,
  useUnbindDevice,
  useContextRecipients,
  useUpdateContext,
  useUpdateDeviceContext,
} from "@/api/mutations";
import { createTestQueryClient, hookWrapper } from "../helpers/render";
import { server } from "../helpers/server";

const api = "http://api.test";

interface Recorded {
  method: string;
  path: string;
  search: string;
  body: unknown;
}

function recorder(requests: Recorded[], body: unknown = null, status = 200) {
  return async ({ request }: { request: Request }) => {
    let parsed: unknown;
    try {
      parsed = await request.clone().json();
    } catch {
      parsed = undefined;
    }
    const url = new URL(request.url);
    requests.push({
      method: request.method,
      path: url.pathname,
      search: url.search,
      body: parsed,
    });
    if (status === 204) return new HttpResponse(null, { status });
    return HttpResponse.json(body as never, { status });
  };
}

describe("context mutations", () => {
  it("create", async () => {
    const requests: Recorded[] = [];
    server.use(
      http.post(`${api}/context`, recorder(requests, { id: "c1", name: "well" }, 201)),
    );
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateContext(), {
      wrapper: hookWrapper(queryClient),
    });
    await result.current.mutateAsync({ name: "well" });

    expect(requests[0]).toMatchObject({ method: "POST", path: "/context", body: { name: "well" } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["contexts"] });
  });

  it("update", async () => {
    const requests: Recorded[] = [];
    server.use(
      http.patch(`${api}/context/c1`, recorder(requests, { id: "c1" })),
    );
    const { result } = renderHook(() => useUpdateContext(), {
      wrapper: hookWrapper(),
    });
    await result.current.mutateAsync({ id: "c1", body: { end: true } });

    expect(requests[0]).toMatchObject({ method: "PATCH", path: "/context/c1", body: { end: true } });
  });

  it("delete", async () => {
    const requests: Recorded[] = [];
    server.use(http.delete(`${api}/context/c1`, recorder(requests, { id: "c1" })));
    const { result } = renderHook(() => useDeleteContext(), {
      wrapper: hookWrapper(),
    });
    await result.current.mutateAsync("c1");

    expect(requests[0]).toMatchObject({ method: "DELETE", path: "/context/c1" });
  });

  it("recipients", async () => {
    let path = "";
    server.use(
      http.get(`${api}/context/c1/share`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json([{ id: "a1", email: "a@b.c" }]);
      }),
    );
    const { result } = renderHook(() => useContextRecipients("c1"), {
      wrapper: hookWrapper(),
    });
    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(path).toBe("/context/c1/share");
  });

  it("share invalidates the recipients and contexts", async () => {
    const requests: Recorded[] = [];
    server.use(
      http.post(`${api}/context/c1/share`, recorder(requests, null, 204)),
    );
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useShareContext(), {
      wrapper: hookWrapper(queryClient),
    });
    await result.current.mutateAsync({ id: "c1", email: "x@y.z" });

    expect(requests[0]).toMatchObject({ path: "/context/c1/share", body: { email: "x@y.z" } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["context", "c1", "share"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["contexts"] });
  });

  it("create device context invalidates contexts and devices", async () => {
    const requests: Recorded[] = [];
    server.use(
      http.post(`${api}/context/c1/device/d1`, recorder(requests, { id: "dc1" }, 201)),
    );
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateDeviceContext(), {
      wrapper: hookWrapper(queryClient),
    });
    await result.current.mutateAsync({
      contextId: "c1",
      deviceId: "d1",
      assignedDeviceName: "upstream",
    });

    expect(requests[0]).toMatchObject({
      path: "/context/c1/device/d1",
      body: { assignedDeviceName: "upstream" },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["devices"] });
  });

  it("update device context", async () => {
    const requests: Recorded[] = [];
    server.use(
      http.patch(`${api}/context/c1/device/d1`, recorder(requests, { id: "dc1" })),
    );
    const { result } = renderHook(() => useUpdateDeviceContext(), {
      wrapper: hookWrapper(),
    });
    await result.current.mutateAsync({
      contextId: "c1",
      deviceId: "d1",
      body: { end: true },
    });

    expect(requests[0]).toMatchObject({ method: "PATCH", body: { end: true } });
  });
});

describe("device mutations", () => {
  it("bind", async () => {
    const requests: Recorded[] = [];
    server.use(
      http.post(`${api}/device/S1/bind`, recorder(requests, { id: "d1" })),
    );
    const { result } = renderHook(() => useBindDevice(), {
      wrapper: hookWrapper(),
    });
    await result.current.mutateAsync("S1");
    expect(requests[0]).toMatchObject({ method: "POST", path: "/device/S1/bind" });
  });

  it("unbind", async () => {
    const requests: Recorded[] = [];
    server.use(
      http.post(`${api}/device/S1/unbind`, recorder(requests, { id: "d1" })),
    );
    const { result } = renderHook(() => useUnbindDevice(), {
      wrapper: hookWrapper(),
    });
    await result.current.mutateAsync("S1");
    expect(requests[0]).toMatchObject({ path: "/device/S1/unbind" });
  });

  it("delete", async () => {
    const requests: Recorded[] = [];
    server.use(
      http.delete(`${api}/device/S1`, recorder(requests, { id: "d1" })),
    );
    const { result } = renderHook(() => useDeleteDevice(), {
      wrapper: hookWrapper(),
    });
    await result.current.mutateAsync("S1");
    expect(requests[0]).toMatchObject({ method: "DELETE", path: "/device/S1" });
  });

  it("create log invalidates that device's logs", async () => {
    const requests: Recorded[] = [];
    server.use(http.post(`${api}/device/log`, recorder(requests, null, 204)));
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateDeviceLog(), {
      wrapper: hookWrapper(queryClient),
    });
    await result.current.mutateAsync({ identifier: "S1", log: "checked" });

    expect(requests[0]).toMatchObject({
      path: "/device/log",
      body: { identifier: "S1", log: "checked" },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["device-log", "S1"] });
  });

  it("send command returns a response id", async () => {
    const requests: Recorded[] = [];
    server.use(
      http.post(
        `${api}/device/sendCommand`,
        recorder(requests, { responseId: "r-1" }),
      ),
    );
    const { result } = renderHook(() => useSendCommand(), {
      wrapper: hookWrapper(),
    });
    const data = await result.current.mutateAsync({
      identifier: "S1",
      command: "reboot",
    });
    expect(data).toEqual({ responseId: "r-1" });
    expect(requests[0]).toMatchObject({ body: { identifier: "S1", command: "reboot" } });
  });

  it("save snapshot", async () => {
    const requests: Recorded[] = [];
    server.use(
      http.post(`${api}/configSnapshot/save`, recorder(requests, null, 204)),
    );
    const { result } = renderHook(() => useSaveSnapshot(), {
      wrapper: hookWrapper(),
    });
    await result.current.mutateAsync({
      name: "baseline",
      deviceId: "d1",
      contextId: "c1",
    });
    expect(requests[0]).toMatchObject({
      path: "/configSnapshot/save",
      body: { name: "baseline", deviceId: "d1", contextId: "c1" },
    });
  });
});
