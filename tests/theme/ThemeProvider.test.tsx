import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { useTheme } from "@/theme/useTheme";

function Consumer() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button type="button" onClick={toggleTheme}>
      {theme}
    </button>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
});

describe("ThemeProvider", () => {
  it("defaults to dark", () => {
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button")).toHaveTextContent("dark");
  });

  it("reads the current html class as the initial theme", () => {
    document.documentElement.classList.add("light");
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button")).toHaveTextContent("light");
  });

  it("toggles, applies classes and persists the choice", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toHaveTextContent("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(localStorage.getItem("rriv-theme")).toBe("light");

    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("follows the OS when no explicit choice is stored", () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) => {
        listener = cb;
      },
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );

    act(() => listener?.({ matches: true } as MediaQueryListEvent));
    expect(screen.getByRole("button")).toHaveTextContent("light");
  });

  it("ignores the OS when the user stored a choice", () => {
    localStorage.setItem("rriv-theme", "dark");
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) => {
        listener = cb;
      },
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );

    act(() => listener?.({ matches: true } as MediaQueryListEvent));
    expect(screen.getByRole("button")).toHaveTextContent("dark");
  });
});

describe("useTheme", () => {
  it("throws outside a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(/ThemeProvider/);
    spy.mockRestore();
  });
});
