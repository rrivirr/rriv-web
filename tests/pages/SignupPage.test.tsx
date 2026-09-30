import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { SignupPage } from "@/pages/SignupPage";
import { renderWithProviders } from "../helpers/render";
import { server } from "../helpers/server";

const fill = async (
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<Record<"firstName" | "lastName" | "email" | "password", string>> = {},
) => {
  await user.type(screen.getByLabelText("First name"), overrides.firstName ?? "Ada");
  await user.type(screen.getByLabelText("Last name"), overrides.lastName ?? "Lovelace");
  await user.type(screen.getByLabelText("Email"), overrides.email ?? "ada@rriv.org");
  await user.type(screen.getByLabelText("Password"), overrides.password ?? "secret");
};

describe("SignupPage", () => {
  it("redirects an authenticated user", () => {
    renderWithProviders(
      <Routes>
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/contexts" element={<p>Contexts page</p>} />
      </Routes>,
      { auth: { status: "authenticated" }, route: "/signup" },
    );
    expect(screen.getByText("Contexts page")).toBeInTheDocument();
  });

  it("validates the form", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupPage />, {
      route: "/signup",
      auth: { status: "unauthenticated" },
    });

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getAllByText("At least 3 characters.")).toHaveLength(2);
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("At least 5 characters.")).toBeInTheDocument();
  });

  it("creates an account and offers sign-in", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post("http://api.test/account", async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>,
      { route: "/signup", auth: { status: "unauthenticated" } },
    );

    await fill(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Account created")).toBeInTheDocument();
    expect(body).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@rriv.org",
      password: "secret",
    });

    await user.click(screen.getByRole("button", { name: "Continue to sign in" }));
    await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument());
  });

  it("surfaces an API error", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("http://api.test/account", () =>
        HttpResponse.json({ message: "email already registered" }, { status: 409 }),
      ),
    );

    renderWithProviders(<SignupPage />, {
      route: "/signup",
      auth: { status: "unauthenticated" },
    });
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "email already registered",
    );
  });
});
