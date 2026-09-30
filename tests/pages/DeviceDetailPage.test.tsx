import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { DeviceDetailPage } from "@/pages/DeviceDetailPage";
import type { Device } from "@/api/types";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const api = "http://api.test";

const page = (
  <Routes>
    <Route path="/devices/:deviceId" element={<DeviceDetailPage />} />
  </Routes>
);

const device: Device = {
  id: "d1",
  serialNumber: "S1",
  uniqueName: "logger-a",
  uid: "u1",
  createdAt: "2026-01-01T00:00:00Z",
  DeviceEuis: [{ eui: "eui-1" }],
  DeviceContext: [
    { assignedDeviceName: "upstream", Context: { id: "c1", name: "well-a" } },
  ],
};

function useDetailHandlers(devices: Device[] | "error" = [device]) {
  server.use(
    http.get(`${api}/device`, () =>
      devices === "error"
        ? HttpResponse.json({ message: "boom" }, { status: 500 })
        : HttpResponse.json(devices),
    ),
    http.get(`${api}/configSnapshot/history`, () =>
      HttpResponse.json({ dataloggerConfigs: [], sensorConfigs: [] }),
    ),
    http.get(`${api}/device/firmware/history`, () =>
      HttpResponse.json([
        {
          version: "1.2.3",
          installedAt: "2026-01-02T00:00:00Z",
          createdAt: "2026-01-02T00:00:00Z",
          contextName: "well-a",
        },
      ]),
    ),
    http.get(`${api}/device/log`, () =>
      HttpResponse.json([
        {
          log: "checked battery",
          createdAt: "2026-01-03T00:00:00Z",
          Creator: { firstName: "Ada", lastName: "L" },
        },
      ]),
    ),
    http.get("http://data.test/readings/:eui", () => HttpResponse.json([])),
  );
}

describe("DeviceDetailPage", () => {
  it("reports a missing device", async () => {
    useDetailHandlers([]);
    renderWithProviders(page, { route: "/devices/d1" });
    expect(await screen.findByText("Device not found")).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    useDetailHandlers("error");
    renderWithProviders(page, { route: "/devices/d1" });
    expect(
      await screen.findByText("Could not load this device: boom"),
    ).toBeInTheDocument();
  });

  it("renders the device with history, logs and actions", async () => {
    useDetailHandlers();
    renderWithProviders(page, { route: "/devices/d1" });

    expect(await screen.findByRole("heading", { name: "logger-a" })).toBeInTheDocument();
    expect(screen.getByText("S1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "well-a" })).toHaveAttribute(
      "href",
      "/contexts/c1",
    );
    expect(screen.getByText("upstream", { exact: false })).toBeInTheDocument();
    expect(await screen.findByText("v1.2.3")).toBeInTheDocument();
    expect(await screen.findByText("checked battery")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save snapshot" })).toBeInTheDocument();
    expect(
      await screen.findByText("No readings in this window"),
    ).toBeInTheDocument();
  });

  it("loads the active config on demand", async () => {
    const user = userEvent.setup();
    useDetailHandlers();
    server.use(
      http.get(`${api}/configSnapshot/active`, () =>
        HttpResponse.json({
          dataloggerConfig: { config: { mode: "continuous" } },
          sensorConfig: [{ id: "s1", name: "ph", config: { ph: 7.2 } }],
        }),
      ),
    );

    renderWithProviders(page, { route: "/devices/d1" });
    await user.click(await screen.findByRole("button", { name: "View config" }));

    expect(await screen.findByText("Datalogger")).toBeInTheDocument();
    expect(screen.getByText(/"mode": "continuous"/)).toBeInTheDocument();
    expect(screen.getByText("Sensors (1)")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("ph")).toBeInTheDocument());
  });
});
