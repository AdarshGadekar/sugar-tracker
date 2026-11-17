// Day / night switch. Night = the dark styles, day = the light ones. Instead of keeping a second
// copy of every dark-mode rule, flip the existing "(prefers-color-scheme: dark)" blocks on or off.
// Loaded as a plain script right after the stylesheets so the page never flashes the wrong mode.
(function () {
  const KEY = "desserted-mode";
  const DARK = "(prefers-color-scheme: dark)";
  const os = matchMedia(DARK);
  const original = new WeakMap();
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch {}

  function walk(rules, on) {
    for (const r of rules) {
      if (r.media) {
        if (!original.has(r)) original.set(r, r.media.mediaText);
        const text = original.get(r);
        if (text.includes("prefers-color-scheme: dark")) r.media.mediaText = on ? "all" : "not all";
      }
      if (r.cssRules) walk(r.cssRules, on);
    }
  }

  function apply(mode) {
    const night = mode === "night";
    document.documentElement.dataset.mode = mode;
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }   // cross-origin (fonts): nothing to flip
      walk(rules, night);
    }
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.content = night ? "dark" : "light";
    const btn = document.getElementById("mode-toggle");
    if (btn) {
      btn.setAttribute("aria-checked", String(night));          // a switch: on = night
      btn.setAttribute("aria-label", "Night mode");
      btn.title = night ? "Switch to day" : "Switch to night";
    }
  }

  const current = () => saved || (os.matches ? "night" : "day");
  apply(current());
  os.addEventListener("change", () => { if (!saved) apply(current()); });
  // stylesheets added later (none today) or the button showing up after load
  addEventListener("load", () => apply(current()));
  document.addEventListener("DOMContentLoaded", () => {
    apply(current());
    document.getElementById("mode-toggle")?.addEventListener("click", () => {
      saved = document.documentElement.dataset.mode === "night" ? "day" : "night";
      try { localStorage.setItem(KEY, saved); } catch {}
      apply(saved);
    });
  });
})();
