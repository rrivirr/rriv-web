import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { RolesCard } from "@/components/RolesCard";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const rolesUrl = "http://api.test/admin/roles";

const ada = { id: "1", email: "ada@rriv.org", firstName: "Ada", lastName: "L", roles: ["admin"] };
const pat = { id: "2", email: "pat@rriv.org", firstName: "Pat", lastName: "P", roles: ["provisioner"] };

describe("RolesCard", () => {
  it("lists role holders and protects the last admin", async () => {
    server.use(http.get(rolesUrl, () => HttpResponse.json([ada, pat])));

    renderWithProviders(<RolesCard />);

    expect(await screen.findByText("ada@rriv.org")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Admin from ada@rriv.org" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove Provisioner from pat@rriv.org" }),
    ).toBeEnabled();
  });

  it("shows an empty state when nobody holds a role", async () => {
    server.use(http.get(rolesUrl, () => HttpResponse.json([])));
    renderWithProviders(<RolesCard />);
    expect(await screen.findByText("No role holders")).toBeInTheDocument();
  });

  it("grants the provisioner role by email by default", async () => {
    const user = userEvent.setup();
    let granted: unknown;
    server.use(
      http.get(rolesUrl, () => HttpResponse.json([ada])),
      http.post(rolesUrl, async ({ request }) => {
        granted = await request.json();
        return HttpResponse.json(pat, { status: 201 });
      }),
    );

    renderWithProviders(<RolesCard />);
    await screen.findByText("ada@rriv.org");
    await user.type(screen.getByLabelText("Account email"), "pat@rriv.org");
    await user.click(screen.getByRole("button", { name: "Grant role" }));

    await waitFor(() => expect(granted).toEqual({ email: "pat@rriv.org", role: "provisioner" }));
  });

  it("can grant admin and revoke a provisioner", async () => {
    const user = userEvent.setup();
    let granted: unknown;
    let revoked: string | undefined;
    server.use(
      http.get(rolesUrl, () => HttpResponse.json([ada, pat])),
      http.post(rolesUrl, async ({ request }) => {
        granted = await request.json();
        return HttpResponse.json(pat, { status: 201 });
      }),
      http.delete(`${rolesUrl}/:role/:id`, ({ params }) => {
        revoked = `${String(params.role)}/${String(params.id)}`;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<RolesCard />);
    await screen.findByText("pat@rriv.org");
    await user.type(screen.getByLabelText("Account email"), "pat@rriv.org");
    await user.selectOptions(screen.getByLabelText("Role"), "admin");
    await user.click(screen.getByRole("button", { name: "Grant role" }));
    await waitFor(() => expect(granted).toEqual({ email: "pat@rriv.org", role: "admin" }));

    await user.click(screen.getByRole("button", { name: "Remove Provisioner from pat@rriv.org" }));
    await waitFor(() => expect(revoked).toBe("provisioner/2"));
  });

  it("surfaces grant errors", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(rolesUrl, () => HttpResponse.json([ada])),
      http.post(rolesUrl, () =>
        HttpResponse.json({ message: "email specified not found" }, { status: 404 }),
      ),
    );

    renderWithProviders(<RolesCard />);
    await screen.findByText("ada@rriv.org");
    await user.type(screen.getByLabelText("Account email"), "x@rriv.org");
    await user.click(screen.getByRole("button", { name: "Grant role" }));
    expect(await screen.findByText("email specified not found")).toBeInTheDocument();
  });
});
