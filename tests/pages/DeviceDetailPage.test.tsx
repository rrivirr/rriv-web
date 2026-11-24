import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
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
    http.get("http://api.test/device/:id/readings", () => HttpResponse.json([])),
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
    // Saving a snapshot lives with the current config, not in its own block.
    expect(screen.queryByText("Snapshots")).not.toBeInTheDocument();
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

  it("paginates config history, firmware and logs", async () => {
    const user = userEvent.setup();
    const offsets = { history: [] as string[], firmware: [] as string[], logs: [] as string[] };
    const pageOf = <T,>(make: (index: number) => T, start: number) =>
      Array.from({ length: 10 }, (_, index) => make(start + index));

    server.use(
      http.get(`${api}/device`, () => HttpResponse.json([device])),
      http.get(`${api}/configSnapshot/history`, ({ request }) => {
        const start = Number(
          new URL(request.url).searchParams.get("offset") ?? 0,
        );
        offsets.history.push(String(start));
        return HttpResponse.json({
          dataloggerConfigs: [],
          sensorConfigs: pageOf(
            (index) => ({
              id: `h${index}`,
              name: `sensor-${index}`,
              config: {},
              active: true,
              createdAt: "2026-01-01T00:00:00Z",
              deactivatedAt: null,
              sensorDriverId: "d1",
            }),
            start,
          ),
        });
      }),
      http.get(`${api}/device/firmware/history`, ({ request }) => {
        const start = Number(
          new URL(request.url).searchParams.get("offset") ?? 0,
        );
        offsets.firmware.push(String(start));
        return HttpResponse.json(pageOf(
          (index) => ({
            version: `1.0.${index}`,
            installedAt: "2026-01-02T00:00:00Z",
            createdAt: "2026-01-02T00:00:00Z",
            contextName: "well-a",
          }),
          start,
        ));
      }),
      http.get(`${api}/device/log`, ({ request }) => {
        const start = Number(
          new URL(request.url).searchParams.get("offset") ?? 0,
        );
        offsets.logs.push(String(start));
        return HttpResponse.json(pageOf(
          (index) => ({
            log: `log-${index}`,
            createdAt: "2026-01-03T00:00:00Z",
            Creator: { firstName: "Ada", lastName: "L" },
          }),
          start,
        ));
      }),
      http.get("http://api.test/device/:id/readings", () => HttpResponse.json([])),
    );

    renderWithProviders(page, { route: "/devices/d1" });
    await screen.findByRole("heading", { name: "logger-a" });

    const nextButtons = await screen.findAllByRole("button", { name: "Next" });
    for (const button of nextButtons) {
      await user.click(button);
    }
    await waitFor(() => {
      expect(offsets.history).toContain("10");
      expect(offsets.firmware).toContain("10");
      expect(offsets.logs).toContain("10");
    });

    const prevButtons = screen.getAllByRole("button", { name: "Previous" });
    for (const button of prevButtons) {
      await user.click(button);
    }
    await waitFor(() =>
      expect(offsets.history.filter((value) => value === "0").length)
        .toBeGreaterThan(1),
    );
  });

  it("shows where each config came from, and publishes it to the library", async () => {
    const user = userEvent.setup();
    useDetailHandlers();
    const created = vi.fn();
    server.use(
      http.get(`${api}/configSnapshot/active`, () =>
        HttpResponse.json({
          dataloggerConfig: { config: { site_name: "SITE-A" }, source: null },
          sensorConfig: [
            {
              id: "s1",
              name: "ph01",
              config: { type: "ph", wait_time: 3 },
              source: {
                kind: "sensor",
                versionId: "v3id",
                version: 3,
                libraryConfigId: "lib1",
                name: "ph-probe",
                latestVersion: 4,
                updateAvailable: true,
                changedSettings: 2,
              },
            },
          ],
        }),
      ),
      http.post(`${api}/datalogger/libraryConfig`, async ({ request }) => {
        created(await request.json());
        return HttpResponse.json({ id: "dl1", name: "site-a" }, { status: 201 });
      }),
    );

    renderWithProviders(page, { route: "/devices/d1" });
    await user.click(await screen.findByRole("button", { name: "View config" }));

    expect(await screen.findByText("Not from the library")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ph-probe v3" })).toHaveAttribute("href", "/library/sensor/lib1");
    expect(screen.getByText(/2 settings changed/)).toBeInTheDocument();
    expect(screen.getByText("v4 available")).toBeInTheDocument();

    // Save and publish sit side by side under the current config.
    await user.click(screen.getByRole("button", { name: "Save as snapshot" }));
    expect(screen.getByLabelText("Snapshot name")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish to library" }));
    expect(screen.queryByLabelText("Snapshot name")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("What to publish"), "datalogger");
    await user.type(screen.getByLabelText(/^Name/), "site-a");
    // The firmware the board runs now (latest install).
    await waitFor(() => expect(screen.getByText(/made with firmware 1\.2\.3/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Published site-a to the library.")).toBeInTheDocument();
    expect(created).toHaveBeenCalledWith({
      name: "site-a",
      firmwareVersion: "1.2.3",
      config: { site_name: "SITE-A" },
    });
  });
});
