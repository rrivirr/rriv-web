import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { LibraryPage } from "@/pages/LibraryPage";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const sensorUrl = "http://api.test/sensor/libraryConfig";
const dataloggerUrl = "http://api.test/datalogger/libraryConfig";

const entry = {
  id: "l1",
  name: "ph-standard",
  description: "A reusable pH sensor config",
  isPublic: true,
  createdAt: "2026-01-01T00:00:00Z",
  Creator: { firstName: "Ada", lastName: "L" },
};

describe("LibraryPage", () => {
  it("lists published configurations", async () => {
    server.use(http.get(sensorUrl, () => HttpResponse.json([entry])));
    renderWithProviders(<LibraryPage />);

    expect(await screen.findByText("ph-standard")).toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(screen.getByText(/Ada L/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ph-standard/ })).toHaveAttribute(
      "href",
      "/library/sensor/l1",
    );
  });

  it("shows an empty state", async () => {
    server.use(http.get(sensorUrl, () => HttpResponse.json([])));
    renderWithProviders(<LibraryPage />);
    expect(await screen.findByText("No configurations found")).toBeInTheDocument();
  });

  it("explains an unauthorized account", async () => {
    server.use(
      http.get(sensorUrl, () =>
        HttpResponse.json({ message: "unauthorized" }, { status: 401 }),
      ),
    );
    renderWithProviders(<LibraryPage />);
    expect(
      await screen.findByText(/not linked to the RRIV API yet/),
    ).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    server.use(
      http.get(sensorUrl, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderWithProviders(<LibraryPage />);
    expect(
      await screen.findByText("Could not load the library: boom"),
    ).toBeInTheDocument();
  });

  it("switches library kind", async () => {
    const user = userEvent.setup();
    const paths: string[] = [];
    server.use(
      http.get(sensorUrl, ({ request }) => {
        paths.push(new URL(request.url).pathname);
        return HttpResponse.json([entry]);
      }),
      http.get(dataloggerUrl, ({ request }) => {
        paths.push(new URL(request.url).pathname);
        return HttpResponse.json([]);
      }),
    );

    renderWithProviders(<LibraryPage />);
    await screen.findByText("ph-standard");

    await user.click(screen.getByRole("button", { name: "Dataloggers" }));
    await waitFor(() =>
      expect(paths).toContain("/datalogger/libraryConfig"),
    );
  });
});
