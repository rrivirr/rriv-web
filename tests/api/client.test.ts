import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/api/client";
import { server } from "../helpers/server";

describe("apiFetch", () => {
  it("prefixes relative paths and attaches the token", async () => {
    let seen: Request | undefined;
    server.use(
      http.get("http://api.test/context", ({ request }) => {
        seen = request;
        return HttpResponse.json([{ id: "1" }]);
      }),
    );

    const data = await apiFetch(vi.fn().mockResolvedValue("tok"), "/context");

    expect(data).toEqual([{ id: "1" }]);
    expect(seen?.headers.get("authorization")).toBe("Bearer tok");
  });

  it("omits the Authorization header when there is no token", async () => {
    let seen: Request | undefined;
    server.use(
      http.get("http://api.test/context", ({ request }) => {
        seen = request;
        return HttpResponse.json([]);
      }),
    );

    await apiFetch(async () => null, "/context");

    expect(seen?.headers.get("authorization")).toBeNull();
  });

  it("sets a JSON content-type for body-carrying methods", async () => {
    let seen: Request | undefined;
    server.use(
      http.post("http://api.test/context", ({ request }) => {
        seen = request;
        return HttpResponse.json({ id: "1" }, { status: 201 });
      }),
    );

    await apiFetch(async () => "t", "/context", {
      method: "POST",
      body: JSON.stringify({ name: "x" }),
    });

    expect(seen?.headers.get("content-type")).toContain("application/json");
  });

  it("returns undefined for 204 responses", async () => {
    server.use(
      http.post("http://api.test/notification/1/read", () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );

    await expect(
      apiFetch(async () => null, "/notification/1/read", { method: "POST" }),
    ).resolves.toBeUndefined();
  });

  it("throws an ApiError with the server message", async () => {
    server.use(
      http.get("http://api.test/context", () =>
        HttpResponse.json({ message: "access denied" }, { status: 403 }),
      ),
    );

    await expect(apiFetch(async () => null, "/context")).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      message: "access denied",
    });

    await expect(apiFetch(async () => null, "/context")).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("falls back to a generic message when the body has none", async () => {
    server.use(
      http.get("http://api.test/context", () =>
        new HttpResponse("boom", { status: 502 }),
      ),
    );

    await expect(apiFetch(async () => null, "/context")).rejects.toMatchObject({
      status: 502,
      message: "Request failed with status 502",
    });
  });

  it("passes absolute URLs through unchanged", async () => {
    let seen: Request | undefined;
    server.use(
      http.get("http://data.test/readings/0102", ({ request }) => {
        seen = request;
        return HttpResponse.json([]);
      }),
    );

    await apiFetch(async () => null, "http://data.test/readings/0102");

    expect(seen).toBeDefined();
  });
});
