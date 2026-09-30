import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "@/auth/AuthProvider";
import { useContexts } from "@/api/contexts";
import { useMe } from "@/api/me";
import { useCreateContext } from "@/api/mutations";
import { createTestQueryClient, makeAuth } from "../helpers/render";
import { server } from "../helpers/server";

const wrapperFor = (queryClient = createTestQueryClient()) =>
  ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={makeAuth()}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </AuthContext.Provider>
  );

describe("useMe", () => {
  it("loads the signed-in account", async () => {
    server.use(
      http.get("http://api.test/account/me", () =>
        HttpResponse.json({
          id: "1",
          email: "ada@rriv.org",
          firstName: "Ada",
          lastName: "Lovelace",
          isAdmin: false,
        }),
      ),
    );

    const { result } = renderHook(() => useMe(), { wrapper: wrapperFor() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.email).toBe("ada@rriv.org");
  });
});

describe("useContexts", () => {
  it("serializes filters into the query string", async () => {
    let search = "";
    server.use(
      http.get("http://api.test/context", ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json([]);
      }),
    );

    const { result } = renderHook(
      () => useContexts({ name: "well", limit: 5 }),
      { wrapper: wrapperFor() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(search).toContain("name=well");
    expect(search).toContain("limit=5");
  });
});

describe("useCreateContext", () => {
  it("posts the body and invalidates the contexts query", async () => {
    let body: unknown;
    server.use(
      http.post("http://api.test/context", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: "1", name: "well" }, { status: 201 });
      }),
    );

    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateContext(), {
      wrapper: wrapperFor(queryClient),
    });

    await result.current.mutateAsync({ name: "well" });

    expect(body).toEqual({ name: "well" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["contexts"] });
  });
});
