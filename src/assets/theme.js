// @ts-check
/*
 * The light/dark theme: follows the os until the reader presses the header toggle, then remembers their choice.
 *  - the inline script in default.html sets <html data-theme> before the css loads; this module keeps it up to date
 *  - choosing the theme the os already asks for clears the stored choice, so the site follows the os again from then on
 *  - other open tabs follow a change through the storage event
 *  - onThemeChange lets other scripts (the mermaid viewer) redraw in the new colours
 */

// shared with the inline script in default.html; namespaced, since every site on a github pages origin shares one localStorage
const STORAGE_KEY = "jenkins-cookbook:theme";

const darkQuery = matchMedia("(prefers-color-scheme: dark)");
const changes = new EventTarget();

/** @typedef {"light" | "dark"} Theme */

/** @returns {Theme} */
function osTheme() {
  return darkQuery.matches ? "dark" : "light";
}

/** @returns {Theme | null} the reader's choice, or null when they haven't made one (or storage is blocked) */
function storedTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

/** @param {Theme} theme */
function storeChoice(theme) {
  try {
    if (theme === osTheme()) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  } catch {
    // storage is blocked, so the choice lasts until the reader leaves the page
  }
}

/**
 * the theme on screen now.
 * @returns {Theme}
 */
export function currentTheme() {
  const theme = document.documentElement.dataset.theme;
  if (theme !== "light" && theme !== "dark") {
    console.error(`[theme] <html data-theme> is "${theme}", not "light" or "dark"; the inline script in default.html should have set it`); // eslint-disable-line no-console
    throw new TypeError("missing or unknown data-theme on <html>");
  }

  return theme;
}

/**
 * calls the listener with the new theme each time it changes.
 * @param {(theme: Theme) => void} listener
 */
export function onThemeChange(listener) {
  changes.addEventListener("change", () => listener(currentTheme()));
}

// the toggle's pressed state and the browser's ui colour (the address bar on a phone) follow the theme
function syncPage() {
  const toggle = document.querySelector(".theme-toggle");
  if (!toggle) {
    console.error("[theme] the header has no .theme-toggle button; check default.html"); // eslint-disable-line no-console
    throw new TypeError("theme toggle not found");
  }

  toggle.setAttribute("aria-pressed", String(currentTheme() === "dark"));

  const background = getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background);
}

/** @param {Theme} theme */
function applyTheme(theme) {
  if (theme === currentTheme()) {
    return;
  }

  document.documentElement.dataset.theme = theme;
  syncPage();
  changes.dispatchEvent(new Event("change"));
}

function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  storeChoice(next);
  applyTheme(next);
}

syncPage();
document.querySelector(".theme-toggle")?.addEventListener("click", toggleTheme);

// without a stored choice, the page follows the os as it changes (an automatic dark mode at sunset, say)
darkQuery.addEventListener("change", () => {
  if (!storedTheme()) {
    applyTheme(osTheme());
  }
});

// a choice made in another tab; a null key means storage was cleared
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY || event.key === null) {
    applyTheme(storedTheme() ?? osTheme());
  }
});
