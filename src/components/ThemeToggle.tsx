import { IconMoon, IconSun } from "@/assets/Icons";
import { useTheme } from "@/theme/useTheme";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      title={`Switch to ${isDark ? "light" : "dark"} theme`}
      className={[
        "grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface-2/60 text-fg-muted transition hover:text-fg",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {isDark ? <IconSun className="h-4 w-4" /> : <IconMoon className="h-4 w-4" />}
    </button>
  );
}
