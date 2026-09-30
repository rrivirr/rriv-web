import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemeProvider } from "@/theme/ThemeProvider";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
});

describe("ThemeToggle", () => {
  it("switches between light and dark", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle className="custom" />
      </ThemeProvider>,
    );

    const toLight = screen.getByRole("button", { name: "Switch to light theme" });
    expect(toLight).toHaveClass("custom");

    await user.click(toLight);

    expect(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    ).toBeInTheDocument();
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });
});
