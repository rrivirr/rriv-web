import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { DeviceTelemetry } from "@/components/DeviceTelemetry";
import type { ConfigHistoryItem, Device, FirmwareHistoryItem } from "@/api/types";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const device: Device = {
  id: "d1",
  serialNumber: "S1",
  uniqueName: "logger-a",
  createdAt: "2026-01-01T00:00:00Z",
  DeviceEuis: [{ eui: "eui-1" }],
};

const readingsUrl = "http://data.test/readings/:eui";

const history: ConfigHistoryItem[] = [
  {
    id: "h1",
    name: "ph-sensor",
    config: { ph: 7.2 },
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    deactivatedAt: null,
    sensorDriverId: "driver-1",
  },
];

const firmware: FirmwareHistoryItem[] = [
  {
    version: "1.2.3",
    installedAt: "2026-01-02T00:00:00Z",
    createdAt: "2026-01-02T00:00:00Z",
  },
];

describe("DeviceTelemetry", () => {
  it("prompts for an EUI when none is registered", () => {
    renderWithProviders(
      <DeviceTelemetry device={{ ...device, DeviceEuis: [] }} history={[]} firmware={[]} />,
    );
    expect(screen.getByText("No EUI registered")).toBeInTheDocument();
  });

  it("renders series controls and markers", async () => {
    server.use(
      http.get(readingsUrl, () =>
        HttpResponse.json([
          { timestamp: "2026-01-01T00:30:00Z", temperature: 4, ph: 7 },
          { timestamp: "2026-01-01T01:30:00Z", temperature: 5, ph: 7.1 },
        ]),
      ),
    );

    renderWithProviders(
      <DeviceTelemetry device={device} history={history} firmware={firmware} />,
    );

    expect(await screen.findByRole("button", { name: "temperature" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ph" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1h" })).toBeInTheDocument();

    // Marker list from history + firmware.
    expect(screen.getByText("ph-sensor")).toBeInTheDocument();
    expect(screen.getByText("firmware v1.2.3")).toBeInTheDocument();
  });

  it("toggles a series off", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(readingsUrl, () =>
        HttpResponse.json([{ timestamp: "2026-01-01T00:30:00Z", temperature: 4 }]),
      ),
    );

    renderWithProviders(
      <DeviceTelemetry device={device} history={[]} firmware={[]} />,
    );

    const toggle = await screen.findByRole("button", { name: "temperature" });
    await user.click(toggle);
    expect(toggle).toHaveClass("line-through");
  });

  it("opens the as-at config when a marker is clicked", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(readingsUrl, () =>
        HttpResponse.json([{ timestamp: "2026-01-01T00:30:00Z", temperature: 4 }]),
      ),
    );

    renderWithProviders(
      <DeviceTelemetry device={device} history={history} firmware={[]} />,
    );

    await user.click(await screen.findByText("ph-sensor"));
    expect(screen.getByText(/Config in effect at/)).toBeInTheDocument();
    expect(screen.getByText(/"ph": 7.2/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() =>
      expect(screen.queryByText(/Config in effect at/)).not.toBeInTheDocument(),
    );
  });

  it("shows an empty state when the window has no readings", async () => {
    server.use(http.get(readingsUrl, () => HttpResponse.json([])));

    renderWithProviders(
      <DeviceTelemetry device={device} history={[]} firmware={[]} />,
    );

    expect(
      await screen.findByText("No readings in this window"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No config or firmware changes recorded/),
    ).toBeInTheDocument();
  });

  it("surfaces data-api errors", async () => {
    server.use(
      http.get(readingsUrl, () => new HttpResponse(null, { status: 500 })),
    );

    renderWithProviders(
      <DeviceTelemetry device={device} history={[]} firmware={[]} />,
    );

    expect(
      await screen.findByText(/Could not load telemetry/),
    ).toBeInTheDocument();
  });
});
