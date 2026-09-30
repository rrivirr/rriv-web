import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { PublicShell } from "@/components/PublicShell";
import { renderWithProviders } from "../helpers/render";

const routes = (
  <Routes>
    <Route element={<PublicShell />}>
      <Route path="/" element={<p>Landing body</p>} />
    </Route>
  </Routes>
);

describe("PublicShell", () => {
  it("renders the header links, outlet and footer", () => {
    renderWithProviders(routes, { route: "/" });

    expect(screen.getByRole("link", { name: "RRIV home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/signup",
    );
    expect(screen.getByText("Landing body")).toBeInTheDocument();
    expect(screen.getByText(/River Restoration Intelligence/)).toBeInTheDocument();
  });
});
