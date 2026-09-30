import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router";
import { IconAlert, IconChevronDown, IconExternal, IconLogOut } from "@/assets/Icons";
import { Logo } from "@/assets/Logo";
import { useMe } from "@/api/me";
import { useUnreadCount } from "@/api/notifications";
import { useAuth } from "@/auth/useAuth";
import { initials } from "@/lib/format";
import { SiteFooter } from "./SiteFooter";
import { ThemeToggle } from "./ThemeToggle";

const RRIV_ORG = "https://rriv.org";

export function AppShell() {
  const { user, signout } = useAuth();
  const me = useMe();
  const unread = useUnreadCount();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { to: "/contexts", label: "Contexts" },
    { to: "/devices", label: "Devices" },
    { to: "/library", label: "Library" },
    ...(me.data?.isAdmin ? [{ to: "/admin", label: "Admin" }] : []),
  ];

  const profile = user?.profile;
  const displayName =
    profile?.name ?? profile?.preferred_username ?? profile?.email ?? "Signed in";
  const email = profile?.email;

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <NavLink to="/contexts" className="shrink-0" aria-label="RRIV dashboard">
              <Logo />
            </NavLink>

            <nav className="hidden items-center gap-1 sm:flex">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      "rounded-lg px-3 py-1.5 text-sm transition",
                      isActive
                        ? "bg-surface-2 text-fg"
                        : "text-fg-muted hover:text-fg",
                    ].join(" ")
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <NavLink
              to="/notifications"
              aria-label="Notifications"
              className="relative grid h-9 w-9 place-items-center rounded-full border border-border text-fg-muted transition hover:bg-surface-2 hover:text-fg"
            >
              <IconAlert className="h-4 w-4" />
              {unread.data ? (
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {unread.data > 99 ? "99+" : unread.data}
                </span>
              ) : null}
            </NavLink>

            <ThemeToggle />

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 rounded-full border border-border bg-surface-2/60 py-1 pl-1 pr-2.5 transition hover:bg-surface-2"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-xs font-semibold text-brand-950">
                  {initials(displayName)}
                </span>
                <span className="hidden max-w-40 truncate text-sm text-fg sm:block">
                  {displayName}
                </span>
                <IconChevronDown
                  className={[
                    "h-4 w-4 text-fg-muted transition-transform",
                    menuOpen ? "rotate-180" : "",
                  ].join(" ")}
                />
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  className="surface animate-rise absolute right-0 mt-2 w-64 overflow-hidden p-1.5"
                >
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-medium text-fg">
                      {displayName}
                    </p>
                    {email ? (
                      <p className="truncate text-xs text-fg-subtle">{email}</p>
                    ) : null}
                  </div>
                  <div className="my-1 h-px bg-border" />
                  <a
                    href={RRIV_ORG}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-fg-muted transition hover:bg-surface-2 hover:text-fg"
                    role="menuitem"
                  >
                    <IconExternal className="h-4 w-4" />
                    rriv.org
                  </a>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      void signout();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-fg-muted transition hover:bg-surface-2 hover:text-fg"
                  >
                    <IconLogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>

      <SiteFooter />
    </div>
  );
}
