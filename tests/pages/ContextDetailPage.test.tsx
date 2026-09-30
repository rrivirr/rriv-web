import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { ContextDetailPage } from "@/pages/ContextDetailPage";
import type { Context, Device } from "@/api/types";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const contextsUrl = "http://api.test/context";
const devicesUrl = "http://api.test/device";

const page = (
  <Routes>
    <Route path="/contexts/:contextId" element={<ContextDetailPage />} />
  </Routes>
);

const owned: Context = {
  id: "c1",
  name: "well-a",
  startedAt: "2026-01-01T00:00:00Z",
  endedAt: null,
  Account: { id: "me", email: "me@rriv.org" },
};

const device: Device = {
  id: "d1",
  serialNumber: "S1",
  uniqueName: "logger-a",
  createdAt: "2026-01-01T00:00:00Z",
  DeviceContext: [
    { assignedDeviceName: "upstream", Context: { id: "c1", name: "well-a" } },
  ],
};

const auth = { user: { profile: { sub: "me" } } as never };

describe("ContextDetailPage", () => {
  it("handles a missing context", async () => {
    server.use(
      http.get(contextsUrl, () =>
        HttpResponse.json([{ ...owned, id: "other" }]),
      ),
      http.get(devicesUrl, () => HttpResponse.json([])),
    );

    renderWithProviders(page, { route: "/contexts/missing", auth });

    expect(await screen.findByText("Context not found")).toBeInTheDocument();
  });

  it("renders an owned context with its devices", async () => {
    server.use(
      http.get(contextsUrl, () => HttpResponse.json([owned])),
      http.get(devicesUrl, () => HttpResponse.json([device])),
      http.get(`${contextsUrl}/c1/share`, () =>
        HttpResponse.json([{ id: "a1", email: "editor@rriv.org" }]),
      ),
    );

    renderWithProviders(page, { route: "/contexts/c1", auth });

    expect(await screen.findByRole("heading", { name: "well-a" })).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("me@rriv.org")).toBeInTheDocument();
    expect(await screen.findByText("upstream")).toBeInTheDocument();
    // Owner-only sharing card.
    expect(await screen.findByText("editor@rriv.org")).toBeInTheDocument();
  });

  it("removes a device from the context", async () => {
    const user = userEvent.setup();
    let path = "";
    server.use(
      http.get(contextsUrl, () => HttpResponse.json([owned])),
      http.get(devicesUrl, () => HttpResponse.json([device])),
      http.get(`${contextsUrl}/c1/share`, () => HttpResponse.json([])),
      http.patch(`${contextsUrl}/c1/device/d1`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ id: "dc1" });
      }),
    );

    renderWithProviders(page, { route: "/contexts/c1", auth });
    await screen.findByText("upstream");
    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(path).toBe("/context/c1/device/d1"));
  });

  it("shows a query error", async () => {
    server.use(
      http.get(contextsUrl, () =>
        HttpResponse.json({ message: "nope" }, { status: 500 }),
      ),
    );

    renderWithProviders(page, { route: "/contexts/c1", auth });
    expect(
      await screen.findByText("Could not load this context: nope"),
    ).toBeInTheDocument();
  });
});
