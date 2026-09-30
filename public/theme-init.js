// Apply the saved (or system) theme before first paint to avoid a flash.
//
// Kept as an external file (rather than inline in index.html) so the
// Content-Security-Policy can use a strict `script-src 'self'` with no
// 'unsafe-inline' or hash allowance. See deployment/nginx/default.conf.
(function () {
  try {
    var stored = localStorage.getItem("rriv-theme");
    var theme =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    document.documentElement.classList.add(theme);
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    document.documentElement.classList.add("dark");
  }
})();
