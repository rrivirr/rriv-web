import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ContextsPage } from "@/pages/ContextsPage";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const contextsUrl = "http://api.test/context";

const auth = { user: { profile: { sub: "me" } } as never };

describe("ContextsPage", () => {
  it("renders the fetched contexts", async () => {
    server.use(
      http.get(contextsUrl, () =>
        HttpResponse.json([
          {
            id: "c1",
            name: "well-a",
            startedAt: new Date().toISOString(),
            endedAt: null,
            Account: { id: "me", email: "me@rriv.org" },
          },
        ]),
      ),
    );

    renderWithProviders(<ContextsPage />, { auth });

    expect(await screen.findByText("well-a")).toBeInTheDocument();
    expect(screen.getByText(/me@rriv\.org/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no contexts", async () => {
    server.use(http.get(contextsUrl, () => HttpResponse.json([])));

    renderWithProviders(<ContextsPage />, { auth });

    expect(await screen.findByText("No contexts found")).toBeInTheDocument();
  });

  it("creates a context", async () => {
    const user = userEvent.setup();
    let posted: unknown;
    server.use(
      http.get(contextsUrl, () => HttpResponse.json([])),
      http.post(contextsUrl, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(
          { id: "c1", name: "spring-2026" },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<ContextsPage />, { auth });
    await screen.findByText("No contexts found");

    await user.click(screen.getByRole("button", { name: "New context" }));
    await user.type(screen.getByLabelText(/Context name/), "spring-2026");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(posted).toEqual({ name: "spring-2026" }));
  });

  it("paginates contexts", async () => {
    const user = userEvent.setup();
    const offsets: string[] = [];
    server.use(
      http.get(contextsUrl, ({ request }) => {
        const url = new URL(request.url);
        offsets.push(url.searchParams.get("offset") ?? "0");
        const start = Number(url.searchParams.get("offset") ?? 0);
        return HttpResponse.json(
          Array.from({ length: 24 }, (_, index) => ({
            id: `c${start + index}`,
            name: `context-${start + index}`,
            startedAt: new Date().toISOString(),
            endedAt: null,
            Account: { id: "me", email: "me@rriv.org" },
          })),
        );
      }),
    );

    renderWithProviders(<ContextsPage />, { auth });
    expect(await screen.findByText("context-0")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(offsets).toContain("24"));

    await user.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() =>
      expect(screen.getByText("context-0")).toBeInTheDocument(),
    );
  });
});
