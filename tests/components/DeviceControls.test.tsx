import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import {
  AddDeviceLogForm,
  DeviceCommandForm,
  DeviceDangerZone,
  SaveSnapshotForm,
} from "@/components/DeviceControls";
import type { Device } from "@/api/types";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const device: Device = {
  id: "d1",
  serialNumber: "S1",
  uniqueName: "logger-a",
  createdAt: "2026-01-01T00:00:00Z",
};

describe("DeviceCommandForm", () => {
  it("sends a command and reports the response id", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post("http://api.test/device/sendCommand", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ responseId: "r-1" });
      }),
    );

    renderWithProviders(<DeviceCommandForm identifier="S1" />);
    await user.type(screen.getByLabelText("Command"), "reboot");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(body).toEqual({ identifier: "S1", command: "reboot" }),
    );
    expect(await screen.findByText(/Command queued \(r-1\)/)).toBeInTheDocument();
  });

  it("surfaces a send error", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("http://api.test/device/sendCommand", () =>
        HttpResponse.json({ message: "device offline" }, { status: 502 }),
      ),
    );

    renderWithProviders(<DeviceCommandForm identifier="S1" />);
    await user.type(screen.getByLabelText("Command"), "reboot");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("device offline")).toBeInTheDocument();
  });
});

describe("AddDeviceLogForm", () => {
  it("adds a log entry", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post("http://api.test/device/log", async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<AddDeviceLogForm identifier="S1" />);
    await user.type(screen.getByLabelText("Log entry"), "checked battery");
    await user.click(screen.getByRole("button", { name: "Add log" }));

    await waitFor(() =>
      expect(body).toEqual({ identifier: "S1", log: "checked battery" }),
    );
  });

  it("surfaces a log error", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("http://api.test/device/log", () =>
        HttpResponse.json({ message: "too long" }, { status: 400 }),
      ),
    );

    renderWithProviders(<AddDeviceLogForm identifier="S1" />);
    await user.type(screen.getByLabelText("Log entry"), "note");
    await user.click(screen.getByRole("button", { name: "Add log" }));

    expect(await screen.findByText("too long")).toBeInTheDocument();
  });
});

describe("SaveSnapshotForm", () => {
  it("keeps the button disabled until the name is long enough", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SaveSnapshotForm deviceId="d1" contextId="c1" />);

    const button = screen.getByRole("button", { name: "Save snapshot" });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText("Snapshot name"), "baseline");
    expect(button).toBeEnabled();
  });

  it("saves a snapshot", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post("http://api.test/configSnapshot/save", async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<SaveSnapshotForm deviceId="d1" contextId="c1" />);
    await user.type(screen.getByLabelText("Snapshot name"), "baseline");
    await user.click(screen.getByRole("button", { name: "Save snapshot" }));

    await waitFor(() =>
      expect(body).toEqual({
        name: "baseline",
        deviceId: "d1",
        contextId: "c1",
      }),
    );
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });
});

describe("DeviceDangerZone", () => {
  it("unbinds after confirmation", async () => {
    const user = userEvent.setup();
    let method = "";
    server.use(
      http.post("http://api.test/device/S1/unbind", ({ request }) => {
        method = request.method;
        return HttpResponse.json(device);
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/" element={<DeviceDangerZone device={device} />} />
        <Route path="/devices" element={<p>Devices page</p>} />
      </Routes>,
      { route: "/" },
    );

    await user.click(screen.getByRole("button", { name: "Unbind device" }));
    expect(screen.getByText("Unbind this device?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(method).toBe("POST"));
    expect(await screen.findByText("Devices page")).toBeInTheDocument();
  });

  it("deletes after confirmation and can cancel", async () => {
    const user = userEvent.setup();
    let method = "";
    server.use(
      http.delete("http://api.test/device/S1", ({ request }) => {
        method = request.method;
        return HttpResponse.json(device);
      }),
    );

    renderWithProviders(<DeviceDangerZone device={device} />);
    await user.click(screen.getByRole("button", { name: "Delete device" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("button", { name: "Delete device" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete device" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(method).toBe("DELETE"));
  });
});
