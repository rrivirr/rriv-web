import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContributePage } from "@/pages/ContributePage";
import { MonitoringPage } from "@/pages/MonitoringPage";
import { PrototypingPage } from "@/pages/PrototypingPage";
import { UseCasesPage } from "@/pages/UseCasesPage";
import { renderWithProviders } from "../helpers/render";

const visitor = { auth: { status: "unauthenticated" as const } };

describe("MonitoringPage", () => {
  it("shows the four monitoring points and the case photo", () => {
    renderWithProviders(<MonitoringPage />, visitor);
    expect(screen.getByRole("heading", { level: 1, name: "Monitoring" })).toBeInTheDocument();
    for (const title of ["Datalogger", "Waterproof case", "Accessible configurability", "Supported sensor kits"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByRole("img", { name: /waterproof sonde case/i })).toBeInTheDocument();
  });
});

describe("PrototypingPage", () => {
  it("shows the four prototyping points and the wiring diagram", () => {
    renderWithProviders(<PrototypingPage />, visitor);
    expect(screen.getByRole("heading", { level: 1, name: "Prototyping" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("img", { name: /wiring diagram/i })).toBeInTheDocument();
  });
});

describe("UseCasesPage", () => {
  it("links to the monitoring and prototyping pages and the docs", () => {
    renderWithProviders(<UseCasesPage />, visitor);
    expect(screen.getByRole("link", { name: /Monitoring/ })).toHaveAttribute("href", "/monitoring");
    expect(screen.getByRole("link", { name: /Prototyping/ })).toHaveAttribute("href", "/prototyping");
    expect(screen.getByRole("heading", { name: "Research" })).toBeInTheDocument();
    expect(screen.queryByText(/citizen science/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /System documentation/ })).toHaveAttribute(
      "href",
      "https://rriv.gitbook.io/rriv-documentation/",
    );
    expect(screen.getByRole("link", { name: /RRIV on GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/rrivirr",
    );
  });
});

describe("ContributePage", () => {
  it("shows the volunteer call, licenses and GitHub link", () => {
    renderWithProviders(<ContributePage />, visitor);
    expect(screen.getByRole("heading", { level: 1, name: "Join the RRIV team!" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GPLv3" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "TAPRv1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Find us on GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/rrivirr",
    );
  });
});
