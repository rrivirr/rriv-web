import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/client";
import { QueryError } from "@/components/QueryError";

describe("QueryError", () => {
  it("renders nothing without an error", () => {
    const { container } = render(<QueryError error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the onboarding hint for a 401", () => {
    render(<QueryError error={new ApiError(401, "unauthorized")} label="contexts" />);
    expect(
      screen.getByText(/not linked to the RRIV API yet/i),
    ).toBeInTheDocument();
  });

  it("shows a generic message for other errors", () => {
    render(<QueryError error={new Error("boom")} label="contexts" />);
    expect(
      screen.getByText("Could not load contexts: boom"),
    ).toBeInTheDocument();
  });

  it("handles non-Error values", () => {
    render(<QueryError error={{ odd: true }} label="devices" />);
    expect(
      screen.getByText("Could not load devices: Something went wrong."),
    ).toBeInTheDocument();
  });
});
