import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { JsonBlock } from "@/components/JsonBlock";
import { SectionCard } from "@/components/SectionCard";
import { SiteFooter } from "@/components/SiteFooter";
import { Skeleton } from "@/components/Skeleton";
import { Spinner } from "@/components/Spinner";

describe("Badge", () => {
  it("renders children with tone-specific classes", () => {
    const { rerender } = render(<Badge tone="success">ok</Badge>);
    expect(screen.getByText("ok")).toHaveClass("text-emerald-600");

    rerender(
      <Badge tone="danger" className="extra">
        bad
      </Badge>,
    );
    expect(screen.getByText("bad")).toHaveClass("extra", "text-red-600");
  });
});

describe("Card", () => {
  it("merges surface and custom classes", () => {
    render(<Card className="x">content</Card>);
    expect(screen.getByText("content")).toHaveClass("surface", "x");
  });
});

describe("JsonBlock", () => {
  it("pretty-prints a value with an optional label", () => {
    render(<JsonBlock label="Config" value={{ a: 1 }} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText(/"a": 1/)).toBeInTheDocument();
  });

  it("renders null for undefined", () => {
    render(<JsonBlock value={undefined} />);
    expect(screen.getByText("null")).toBeInTheDocument();
  });
});

describe("SectionCard", () => {
  it("renders title, subtitle, action and body", () => {
    render(
      <SectionCard
        title="Placement"
        subtitle="Where it lives"
        action={<button type="button">Act</button>}
        bodyClassName="body-x"
      >
        <p>Body</p>
      </SectionCard>,
    );
    expect(screen.getByRole("heading", { name: "Placement" })).toBeInTheDocument();
    expect(screen.getByText("Where it lives")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });
});

describe("SiteFooter", () => {
  it("shows the tagline and external links", () => {
    render(<SiteFooter />);
    expect(screen.getByText(/River Restoration Intelligence/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "rriv.org" })).toHaveAttribute(
      "href",
      "https://rriv.org",
    );
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/rrivirr",
    );
  });
});

describe("Spinner", () => {
  it("renders a status with an optional label", () => {
    render(<Spinner label="Loading…" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });
});

describe("Skeleton", () => {
  it("renders a decorative block", () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.firstElementChild).toHaveClass("h-4");
  });
});
