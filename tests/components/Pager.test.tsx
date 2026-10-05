import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pager } from "@/components/Pager";

const noop = () => {};

describe("Pager", () => {
  it("renders nothing when there is a single short page", () => {
    const { container } = render(
      <Pager offset={0} pageSize={10} count={3} onPrev={noop} onNext={noop} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers Next when the page is full and fires the handler", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(
      <Pager
        offset={0}
        pageSize={10}
        count={10}
        onPrev={noop}
        onNext={onNext}
        noun="device"
      />,
    );

    expect(screen.getByText("Showing 10 devices")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("offers Previous past the first page and fires the handler", async () => {
    const user = userEvent.setup();
    const onPrev = vi.fn();
    render(
      <Pager
        offset={10}
        pageSize={10}
        count={10}
        onPrev={onPrev}
        onNext={noop}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it("uses total for the range label and Next availability", () => {
    render(
      <Pager
        offset={0}
        pageSize={10}
        count={10}
        total={32}
        onPrev={noop}
        onNext={noop}
      />,
    );
    expect(screen.getByText("Showing 1–10 of 32")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("disables Next at the last page (total known)", () => {
    render(
      <Pager
        offset={30}
        pageSize={10}
        count={2}
        total={32}
        onPrev={noop}
        onNext={noop}
      />,
    );
    expect(screen.getByText("Showing 31–32 of 32")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  });

  it("respects maxOffset", () => {
    render(
      <Pager
        offset={100}
        pageSize={10}
        count={10}
        maxOffset={100}
        onPrev={noop}
        onNext={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("uses rawCount for Next when a client filter empties the page", () => {
    render(
      <Pager
        offset={0}
        pageSize={10}
        count={0}
        rawCount={10}
        onPrev={noop}
        onNext={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("disables both buttons while fetching", () => {
    render(
      <Pager
        offset={10}
        pageSize={10}
        count={10}
        isFetching
        onPrev={noop}
        onNext={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
