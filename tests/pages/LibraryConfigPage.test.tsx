import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { LibraryConfigPage } from "@/pages/LibraryConfigPage";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const api = "http://api.test";

const page = (
  <Routes>
    <Route path="/library/:kind/:id" element={<LibraryConfigPage />} />
  </Routes>
);

const detail = {
  id: "l1",
  name: "ph-standard",
  description: "A reusable pH sensor config",
  isPublic: true,
  createdAt: "2026-01-01T00:00:00Z",
  Creator: { firstName: "Ada", lastName: "L" },
  SensorLibraryConfigVersion: [
    {
      version: 1,
      description: "initial",
      Creator: { firstName: "Ada", lastName: "L" },
      SensorConfig: {
        id: "s1",
        name: "ph",
        config: { ph: 7.2 },
        sensorDriverId: "driver-1",
      },
    },
  ],
};

describe("LibraryConfigPage", () => {
  it("rejects an unknown library kind", () => {
    renderWithProviders(page, { route: "/library/bogus/x1" });
    expect(screen.getByText("Unknown library")).toBeInTheDocument();
  });

  it("handles a 404", async () => {
    server.use(
      http.get(`${api}/sensor/libraryConfig/missing`, () =>
        HttpResponse.json({ message: "not found" }, { status: 404 }),
      ),
    );
    renderWithProviders(page, { route: "/library/sensor/missing" });
    expect(
      await screen.findByText("Configuration not available"),
    ).toBeInTheDocument();
  });

  it("renders the detail with its versions", async () => {
    server.use(
      http.get(`${api}/sensor/libraryConfig/l1`, () => HttpResponse.json(detail)),
    );

    renderWithProviders(page, { route: "/library/sensor/l1" });

    expect(
      await screen.findByRole("heading", { name: "ph-standard" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText(/driver driver-1/)).toBeInTheDocument();
    expect(screen.getByText(/"ph": 7.2/)).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    server.use(
      http.get(`${api}/sensor/libraryConfig/l1`, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderWithProviders(page, { route: "/library/sensor/l1" });
    expect(
      await screen.findByText("Could not load this configuration: boom"),
    ).toBeInTheDocument();
  });
});
