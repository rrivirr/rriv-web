const RRIV_ORG = "https://rriv.org";

const LINKS = [
  { href: RRIV_ORG, label: "rriv.org" },
  { href: "https://github.com/rrivirr", label: "GitHub" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border px-4 py-5 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 text-xs text-fg-subtle sm:flex-row">
        <p>RRIV — River Restoration Intelligence and Verification</p>
        <nav className="flex items-center gap-4">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-fg"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
