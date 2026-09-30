import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { AdminsCard } from "@/components/AdminsCard";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const adminsUrl = "http://api.test/admin/admins";

describe("AdminsCard", () => {
  it("lists admins and disables removal of the last one", async () => {
    server.use(
      http.get(adminsUrl, () =>
        HttpResponse.json([
          { id: "1", email: "ada@rriv.org", firstName: "Ada", lastName: "L" },
        ]),
      ),
    );

    renderWithProviders(<AdminsCard />);

    expect(await screen.findByText("ada@rriv.org")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
  });

  it("shows an empty state when there are no admins", async () => {
    server.use(http.get(adminsUrl, () => HttpResponse.json([])));

    renderWithProviders(<AdminsCard />);

    expect(await screen.findByText("No admins")).toBeInTheDocument();
  });

  it("grants an admin by email", async () => {
    const user = userEvent.setup();
    let granted: unknown;
    server.use(
      http.get(adminsUrl, () => HttpResponse.json([])),
      http.post(adminsUrl, async ({ request }) => {
        granted = await request.json();
        return HttpResponse.json(
          { id: "2", email: "new@rriv.org", firstName: "N", lastName: "U" },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<AdminsCard />);
    await screen.findByText("No admins");

    await user.type(screen.getByLabelText("Account email"), "new@rriv.org");
    await user.click(screen.getByRole("button", { name: "Add admin" }));

    await waitFor(() => expect(granted).toEqual({ email: "new@rriv.org" }));
  });

  it("surfaces a grant failure", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(adminsUrl, () => HttpResponse.json([])),
      http.post(adminsUrl, () =>
        HttpResponse.json({ message: "no such account" }, { status: 404 }),
      ),
    );

    renderWithProviders(<AdminsCard />);
    await screen.findByText("No admins");

    await user.type(screen.getByLabelText("Account email"), "missing@rriv.org");
    await user.click(screen.getByRole("button", { name: "Add admin" }));

    expect(await screen.findByText("no such account")).toBeInTheDocument();
  });
});
