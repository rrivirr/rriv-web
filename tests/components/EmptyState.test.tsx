import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/EmptyState";

describe("EmptyState", () => {
  it("renders the icon, title, description and action", () => {
    render(
      <EmptyState
        icon={<span data-testid="icon" />}
        title="Nothing here"
        description="Try another filter."
        action={<button type="button">Go</button>}
      />,
    );

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Try another filter.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("renders only the title when the rest is omitted", () => {
    render(<EmptyState title="Just a title" />);
    expect(screen.getByText("Just a title")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
