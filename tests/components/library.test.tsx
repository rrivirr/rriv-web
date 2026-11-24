import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { OfficialConfigsCard } from "@/components/OfficialConfigsCard";
import { PublishPanel } from "@/components/library/PublishPanel";
import { SavedSnapshotsPanel } from "@/components/library/SavedSnapshotsPanel";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const api = "http://api.test";

const content = {
  datalogger: { site_name: "SITE-A" },
  sensors: [{ name: "ph01", config: { type: "ph" } }],
};

describe("PublishPanel", () => {
  it("publishes a new public system config with the firmware version", async () => {
    const user = userEvent.setup();
    const created = vi.fn();
    const patched = vi.fn();
    server.use(
      http.post(`${api}/configSnapshot/libraryConfig`, async ({ request }) => {
        created(await request.json());
        return HttpResponse.json({ id: "lib9", name: "station" }, { status: 201 });
      }),
      http.patch(`${api}/configSnapshot/libraryConfig/lib9`, async ({ request }) => {
        patched(await request.json());
        return HttpResponse.json({ id: "lib9", name: "station", isPublic: true });
      }),
    );
    renderWithProviders(<PublishPanel content={content} firmwareVersion="1.4.0" />);

    expect(screen.getByText(/Recorded as made with firmware 1\.4\.0/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Name/), "station");
    await user.click(screen.getByLabelText("Make it public"));
    await user.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByText("Published station to the library.")).toBeInTheDocument();
    expect(created).toHaveBeenCalledWith({
      name: "station",
      firmwareVersion: "1.4.0",
      datalogger: { site_name: "SITE-A" },
      sensors: [{ type: "ph", name: "ph01" }],
    });
    expect(patched).toHaveBeenCalledWith({ isPublic: true });
    expect(screen.getByRole("link", { name: "View in library" })).toHaveAttribute(
      "href",
      "/library/system/lib9",
    );
  });

  it("publishes one sensor as a new version of one of yours", async () => {
    const user = userEvent.setup();
    const published = vi.fn();
    server.use(
      http.get(`${api}/sensor/libraryConfig`, () =>
        HttpResponse.json([{ id: "s7", name: "ph-probe", createdAt: "2026-01-01T00:00:00Z" }]),
      ),
      http.post(`${api}/sensor/libraryConfig/s7/version`, async ({ request }) => {
        published(await request.json());
        return new HttpResponse(null, { status: 201 });
      }),
    );
    renderWithProviders(<PublishPanel content={content} />);

    await user.selectOptions(screen.getByLabelText("What to publish"), "sensor");
    await user.click(screen.getByLabelText("New version of one of mine"));
    const select = screen.getByLabelText("Library config");
    await waitFor(() => expect(within(select).getByText("ph-probe")).toBeInTheDocument());
    await user.selectOptions(select, "s7");
    await user.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByText("Published a new version of ph-probe.")).toBeInTheDocument();
    expect(published).toHaveBeenCalledWith({ sensorName: "ph01", config: { type: "ph" } });
  });

  it("holds back a description the API would refuse", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PublishPanel content={content} />);
    await user.type(screen.getByLabelText(/^Name/), "station");
    const publish = screen.getByRole("button", { name: "Publish" });
    expect(publish).toBeEnabled();

    await user.type(screen.getByLabelText("Description (optional)"), "ab");
    expect(screen.getByText("Description must be 3–20 characters.")).toBeInTheDocument();
    expect(publish).toBeDisabled();

    await user.type(screen.getByLabelText("Description (optional)"), "c");
    expect(screen.queryByText(/must be 3–20/)).not.toBeInTheDocument();
    expect(publish).toBeEnabled();
  });

  it("shows the API's reason when publishing fails", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${api}/datalogger/libraryConfig`, () =>
        HttpResponse.json({ message: "dl already exists" }, { status: 409 }),
      ),
    );
    renderWithProviders(<PublishPanel content={content} />);
    await user.selectOptions(screen.getByLabelText("What to publish"), "datalogger");
    await user.type(screen.getByLabelText(/^Name/), "dl1");
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("dl already exists")).toBeInTheDocument();
  });
});

describe("SavedSnapshotsPanel", () => {
  const snapshots = [
    {
      id: "snap1",
      name: "before-trip",
      createdAt: "2026-11-01T00:00:00Z",
      DataloggerConfig: [{ id: "d", config: { site_name: "A" } }],
      SensorConfig: [{ id: "s", name: "ph01", config: { type: "ph" } }],
    },
  ];

  it("lists, renames and deletes your saved configs", async () => {
    const user = userEvent.setup();
    const renamed = vi.fn();
    const deleted = vi.fn();
    server.use(
      http.get(`${api}/configSnapshot`, () => HttpResponse.json(snapshots)),
      http.patch(`${api}/configSnapshot/snap1`, async ({ request }) => {
        renamed(await request.json());
        return HttpResponse.json({ id: "snap1", name: "pre-season" });
      }),
      http.delete(`${api}/configSnapshot/snap1`, () => {
        deleted();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<SavedSnapshotsPanel />);

    expect(await screen.findByText("before-trip")).toBeInTheDocument();
    expect(screen.getByText(/Datalogger and 1 sensor/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Apply to a board" })).toHaveAttribute(
      "href",
      "/connect?apply=saved%3Asnap1",
    );

    await user.click(screen.getByRole("button", { name: "Rename" }));
    const field = screen.getByLabelText("New name for before-trip");
    await user.clear(field);
    await user.type(field, "pre-season");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(renamed).toHaveBeenCalledWith({ name: "pre-season" }));

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByText(/Boards already set from it/).parentElement!).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleted).toHaveBeenCalled());
  });

  it("publishes a saved config as a whole device only", async () => {
    const user = userEvent.setup();
    server.use(http.get(`${api}/configSnapshot`, () => HttpResponse.json(snapshots)));
    renderWithProviders(<SavedSnapshotsPanel />);
    await user.click(await screen.findByRole("button", { name: "Publish" }));
    expect(screen.getByLabelText("What to publish")).toBeDisabled();
    expect(screen.getByLabelText("What to publish")).toHaveDisplayValue(/Whole device/);
  });
});

describe("OfficialConfigsCard", () => {
  it("marks a published config official", async () => {
    const user = userEvent.setup();
    let official = false;
    const listed = vi.fn();
    server.use(
      http.get(`${api}/configSnapshot/libraryConfig`, ({ request }) => {
        listed(new URL(request.url).searchParams.get("isPublic"));
        return HttpResponse.json([
          { id: "lib1", name: "station", isPublic: true, isOfficial: official, createdAt: "2026-01-01T00:00:00Z" },
        ]);
      }),
      http.patch(`${api}/admin/libraryConfig/system/lib1`, async ({ request }) => {
        official = ((await request.json()) as { isOfficial: boolean }).isOfficial;
        return HttpResponse.json({ id: "lib1", name: "station", isPublic: true, isOfficial: official });
      }),
    );
    renderWithProviders(<OfficialConfigsCard />);

    await user.click(await screen.findByRole("button", { name: "Mark station official" }));
    expect(await screen.findByRole("button", { name: "Unmark station official" })).toBeInTheDocument();
    expect(official).toBe(true);
    expect(listed).toHaveBeenCalledWith("true");
  });
});
