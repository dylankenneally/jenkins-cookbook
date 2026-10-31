// @ts-check
/*
 * Renders ```mermaid blocks (emitted as <pre class="mermaid">) into interactive diagrams.
 *  - mermaid is only fetched when the page actually has a diagram
 *  - each diagram gets a bar with its zoom level and buttons: zoom in/out, fit, actual size, fullscreen (where the browser supports it)
 *  - drag to pan, ctrl/cmd + wheel or trackpad pinch to zoom (plain wheel zooms in fullscreen), two-finger pinch on touch
 *  - on touch screens a vertical swipe scrolls the page rather than the diagram, except in fullscreen
 *  - keyboard on a focused diagram: + / - zoom, 0 fit, 1 actual size, arrows pan, f fullscreen
 *  - a diagram opens no smaller than a readable size; one too wide for that starts at its left edge, with a hint to drag
 *  - diagrams are drawn in the site's fonts and palette, read from the css custom properties in style.css
 *  - each diagram is named and described by its accTitle and accDescr (the build fails without them)
 */

// served from this site (copied from node_modules by .eleventy.js), so the version is the one in package-lock.json
const MERMAID_URL = new URL("./vendor/mermaid/mermaid.esm.min.mjs", import.meta.url).href;

// mermaid theme variables and the style.css custom properties they're taken from; base is the only theme meant to be customised
const THEME_PROPERTIES = {
  fontFamily: "--font-sans",
  background: "--color-bg",
  textColor: "--color-text",
  primaryColor: "--color-code-bg",
  primaryTextColor: "--color-text",
  primaryBorderColor: "--color-accent",
  lineColor: "--color-text-light",
  clusterBkg: "--color-bg",
  clusterBorder: "--color-border",
  titleColor: "--color-text-light",
  edgeLabelBackground: "--color-bg"
};

// the fonts used inside labels: plain text, and <code> spans styled by style.css
const LABEL_FONTS = ["--font-sans", "--font-mono"];

// mermaid only wraps a label wider than this, so lines break where the source puts <br/> rather than in the middle of a code span
const LABEL_WRAP_WIDTH = 400;

// boxes size to their labels; mermaid's default 120px minimum made "dev" as wide as "image 1.4.0" and the diagrams too wide for a phone
const MIN_NODE_WIDTH = 60;

const HELP_TEXT = "Drag or use arrow keys to pan, plus and minus to zoom, 0 to fit, F for fullscreen.";

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.25;
const PAN_STEP = 60;

// a diagram never opens smaller than this, so its 16px labels start at about 10px at worst; fit and zoom out still go further
const MIN_START_SCALE = 0.65;

// cap the inline viewport so a tall diagram doesn't swallow the page
const MAX_VIEWPORT_HEIGHT_RATIO = 0.75;

// 24px stroke icons, drawn like the header's theme toggle
const ICONS = {
  zoomIn: "M12 5v14M5 12h14",
  zoomOut: "M5 12h14",
  fit: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
  enterFullscreen: "M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7",
  exitFullscreen: "M20 10h-6V4M14 10l7-7M4 14h6v6M10 14l-7 7"
};

/**
 * pan/zoom state for one diagram, applied as a css transform on the svg.
 * @param {HTMLElement} viewport the clipping element that receives input
 * @param {SVGSVGElement} svg the rendered diagram
 * @param {{ width: number, height: number }} size the diagram's natural size in css pixels
 * @param {(scale: number, overflowing: boolean) => void} onChange called after every change, with whether part of the diagram is out of view
 */
function createPanZoom(viewport, svg, size, onChange) {
  let scale = 1;
  let x = 0;
  let y = 0;

  // the view to put back when the viewport resizes; "free" (after the reader pans or zooms) is left where it is
  let mode = "start";

  function overflowing() {
    return size.width * scale > viewport.clientWidth + 1 || size.height * scale > viewport.clientHeight + 1;
  }

  function apply() {
    svg.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    onChange(scale, overflowing());
  }

  // zoom about a point in viewport coordinates so the content under it stays put
  function zoomAt(factor, px, py) {
    mode = "free";
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    x = px - ((px - x) * next) / scale;
    y = py - ((py - y) * next) / scale;
    scale = next;
    apply();
  }

  function zoomCentre(factor) {
    zoomAt(factor, viewport.clientWidth / 2, viewport.clientHeight / 2);
  }

  function panBy(dx, dy) {
    mode = "free";
    x += dx;
    y += dy;
    apply();
  }

  // centre the diagram at the given scale
  function centreAt(nextScale) {
    scale = nextScale;
    x = (viewport.clientWidth - size.width * scale) / 2;
    y = (viewport.clientHeight - size.height * scale) / 2;
    apply();
  }

  // largest scale that shows the whole diagram, never enlarging past natural size
  function fitScale() {
    return Math.min(1, viewport.clientWidth / size.width, viewport.clientHeight / size.height);
  }

  // the opening view: fitted if that's readable, otherwise at the smallest readable scale from the top left, where the flow starts
  function start() {
    mode = "start";
    scale = Math.min(1, Math.max(fitScale(), MIN_START_SCALE));
    const width = size.width * scale;
    const height = size.height * scale;
    x = width > viewport.clientWidth ? 0 : (viewport.clientWidth - width) / 2;
    y = height > viewport.clientHeight ? 0 : (viewport.clientHeight - height) / 2;
    apply();
  }

  function fit() {
    mode = "fit";
    centreAt(fitScale());
  }

  function actualSize() {
    mode = "actual";
    centreAt(1);
  }

  // after a resize: reapply the named view, or the opening one if the reader moved it and the fullscreen state changed
  function refresh(fullscreenChanged) {
    if (mode === "free" && !fullscreenChanged) {
      apply();
      return;
    }

    const views = { start, fit, actual: actualSize };
    (views[mode] ?? start)();
  }

  return { zoomAt, zoomCentre, panBy, fit, actualSize, refresh };
}

/**
 * wires mouse, touch, wheel and keyboard input on the viewport to the pan/zoom state.
 * @param {HTMLElement} viewer the outer element (fullscreen target)
 * @param {HTMLElement} viewport the clipping element that receives input
 * @param {ReturnType<typeof createPanZoom>} view
 */
function bindInput(viewer, viewport, view) {
  /** @type {Map<number, { x: number, y: number }>} */
  const pointers = new Map();
  let pinchDistance = 0;

  function localPoint(clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function twoPointerGeometry() {
    const [a, b] = [...pointers.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, localPoint(event.clientX, event.clientY));
    viewport.classList.add("is-panning");
    if (pointers.size === 2) {
      pinchDistance = twoPointerGeometry().distance;
    }
  });

  viewport.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) {
      return;
    }

    const current = localPoint(event.clientX, event.clientY);

    // single pointer drags; two pointers pinch (and pan via the midpoint)
    if (pointers.size === 1) {
      pointers.set(event.pointerId, current);
      // outside fullscreen a finger's vertical movement belongs to the page scroll, so it doesn't nudge the diagram before the browser takes over
      const touchInline = event.pointerType === "touch" && document.fullscreenElement !== viewer;
      view.panBy(current.x - previous.x, touchInline ? 0 : current.y - previous.y);
      return;
    }

    const before = twoPointerGeometry();
    pointers.set(event.pointerId, current);
    const after = twoPointerGeometry();
    view.panBy(after.mid.x - before.mid.x, after.mid.y - before.mid.y);
    if (pinchDistance > 0) {
      view.zoomAt(after.distance / pinchDistance, after.mid.x, after.mid.y);
    }
    pinchDistance = after.distance;
  });

  // pointercancel also arrives when the browser takes a vertical swipe to scroll the page (touch-action: pan-y)
  function release(event) {
    pointers.delete(event.pointerId);
    pinchDistance = 0;
    if (pointers.size === 0) {
      viewport.classList.remove("is-panning");
    }
  }

  viewport.addEventListener("pointerup", release);
  viewport.addEventListener("pointercancel", release);

  // plain wheel scrolls the page inline; ctrl/cmd + wheel (and trackpad pinch, which reports ctrlKey) zooms
  viewport.addEventListener("wheel", (event) => {
    const inFullscreen = document.fullscreenElement === viewer;
    if (!inFullscreen && !event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    const point = localPoint(event.clientX, event.clientY);
    view.zoomAt(Math.exp(-event.deltaY * 0.002), point.x, point.y);
  }, { passive: false });

  viewport.addEventListener("dblclick", () => view.fit());

  /** @type {Record<string, () => void>} */
  const keys = {
    "+": () => view.zoomCentre(ZOOM_STEP),
    "=": () => view.zoomCentre(ZOOM_STEP),
    "-": () => view.zoomCentre(1 / ZOOM_STEP),
    "0": () => view.fit(),
    "1": () => view.actualSize(),
    ArrowLeft: () => view.panBy(PAN_STEP, 0),
    ArrowRight: () => view.panBy(-PAN_STEP, 0),
    ArrowUp: () => view.panBy(0, PAN_STEP),
    ArrowDown: () => view.panBy(0, -PAN_STEP)
  };
  if (document.fullscreenEnabled) {
    keys.f = () => toggleFullscreen(viewer);
  }

  viewport.addEventListener("keydown", (event) => {
    const action = keys[event.key];
    if (!action || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    event.preventDefault();
    action();
  });
}

/**
 * enters or leaves fullscreen; only offered where document.fullscreenEnabled, so a refusal is unexpected.
 * @param {HTMLElement} viewer
 */
function toggleFullscreen(viewer) {
  const request = document.fullscreenElement === viewer ? document.exitFullscreen() : viewer.requestFullscreen();
  request.catch((error) => {
    console.error("[mermaid-viewer] the browser refused to change fullscreen for a diagram", error); // eslint-disable-line no-console
    throw error;
  });
}

/**
 * builds an empty toolbar button; the caller fills in its icon or text.
 * @param {string} label accessible name and tooltip
 * @param {() => void} onClick
 */
function toolbarButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mermaid-viewer__button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onClick);
  return button;
}

/**
 * sets a button's icon; the markup is built only from the ICONS constants.
 * @param {HTMLButtonElement} button
 * @param {keyof typeof ICONS} name
 */
function setIcon(button, name) {
  button.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${ICONS[name]}"/></svg>`;
}

/**
 * @param {string} label
 * @param {keyof typeof ICONS} name
 * @param {() => void} onClick
 */
function iconButton(label, name, onClick) {
  const button = toolbarButton(label, onClick);
  setIcon(button, name);
  return button;
}

// natural size of a mermaid svg, from its viewBox (mermaid sets width="100%" so attributes can't be trusted)
function naturalSize(svg) {
  const box = svg.viewBox.baseVal;
  if (box && box.width > 0 && box.height > 0) {
    return { width: box.width, height: box.height };
  }

  const rect = svg.getBBox();
  return { width: rect.width, height: rect.height };
}

/**
 * inline height: the diagram at its opening scale for the current width, capped so it doesn't dominate the page.
 * @param {HTMLElement} viewport
 * @param {{ width: number, height: number }} size
 */
function sizeViewport(viewport, size) {
  const startScale = Math.min(1, Math.max(viewport.clientWidth / size.width, MIN_START_SCALE));
  viewport.style.height = `${Math.ceil(Math.min(size.height * startScale, window.innerHeight * MAX_VIEWPORT_HEIGHT_RATIO)) + 2}px`;
}

/**
 * the strip above a diagram: a hint when part of it is out of view, the zoom level, and the controls.
 * @param {HTMLElement} viewer the outer element (fullscreen target)
 * @param {ReturnType<typeof createPanZoom>} view
 */
function createBar(viewer, view) {
  const bar = document.createElement("div");
  bar.className = "mermaid-viewer__bar";

  // the help text already tells screen readers how to pan
  const hint = document.createElement("span");
  hint.className = "mermaid-viewer__hint";
  hint.textContent = "Drag to pan";
  hint.setAttribute("aria-hidden", "true");
  hint.hidden = true;

  const zoom = document.createElement("span");
  zoom.className = "mermaid-viewer__zoom";
  const zoomLabel = document.createElement("span");
  zoomLabel.className = "visually-hidden";
  zoomLabel.textContent = "Zoom ";
  const zoomValue = document.createElement("span");
  zoom.append(zoomLabel, zoomValue);

  // aria-disabled rather than disabled, so a button reaching its limit keeps keyboard focus
  const zoomIn = iconButton("Zoom in", "zoomIn", () => view.zoomCentre(ZOOM_STEP));
  const zoomOut = iconButton("Zoom out", "zoomOut", () => view.zoomCentre(1 / ZOOM_STEP));
  const actual = toolbarButton("Actual size 1:1", () => view.actualSize());
  actual.textContent = "1:1";

  const toolbar = document.createElement("div");
  toolbar.className = "mermaid-viewer__toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Diagram controls");
  toolbar.append(zoomIn, zoomOut, iconButton("Fit to view", "fit", () => view.fit()), actual);

  // iphone safari has no element fullscreen, so the button is left out there
  if (document.fullscreenEnabled) {
    const fullscreen = iconButton("Fullscreen", "enterFullscreen", () => toggleFullscreen(viewer));
    fullscreen.setAttribute("aria-pressed", "false");
    document.addEventListener("fullscreenchange", () => {
      const active = document.fullscreenElement === viewer;
      fullscreen.setAttribute("aria-pressed", String(active));
      setIcon(fullscreen, active ? "exitFullscreen" : "enterFullscreen");
    });
    toolbar.append(fullscreen);
  }

  bar.append(hint, zoom, toolbar);

  /**
   * @param {number} scale
   * @param {boolean} overflowing
   */
  function update(scale, overflowing) {
    zoomValue.textContent = `${Math.round(scale * 100)}%`;
    zoomIn.setAttribute("aria-disabled", String(scale >= MAX_SCALE));
    zoomOut.setAttribute("aria-disabled", String(scale <= MIN_SCALE));
    hint.hidden = !overflowing;
  }

  return { element: bar, update };
}

/**
 * replaces a <pre class="mermaid"> with the rendered, interactive diagram.
 * @param {HTMLPreElement} pre
 * @param {string} svgMarkup
 * @param {string} id unique to this diagram, for the help text's id
 */
function mountViewer(pre, svgMarkup, id) {
  const viewer = document.createElement("figure");
  viewer.className = "mermaid-viewer";

  const viewport = document.createElement("div");
  viewport.className = "mermaid-viewer__viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("role", "group");
  viewport.innerHTML = svgMarkup;

  const svg = viewport.querySelector("svg");
  if (!svg) {
    console.error("[mermaid-viewer] mermaid returned markup with no <svg> element"); // eslint-disable-line no-console
    throw new TypeError("mermaid render produced no svg");
  }

  // mermaid points the svg at the <title> and <desc> it made from accTitle and accDescr; the focusable viewport reuses them, plus how to drive it
  const titleId = svg.getAttribute("aria-labelledby");
  const descId = svg.getAttribute("aria-describedby");
  if (!titleId || !descId) {
    console.error(`[mermaid-viewer] diagram ${id} has no accessible title or description; add accTitle and accDescr to its source`); // eslint-disable-line no-console
    throw new TypeError("mermaid diagram without accTitle and accDescr");
  }

  const help = document.createElement("p");
  help.id = `${id}-help`;
  help.className = "visually-hidden";
  help.textContent = HELP_TEXT;

  viewport.setAttribute("aria-labelledby", titleId);
  viewport.setAttribute("aria-describedby", `${descId} ${help.id}`);

  viewer.append(viewport, help);
  pre.replaceWith(viewer);

  // pin the svg to its natural size so the transform is the only thing scaling it
  const size = naturalSize(svg);
  svg.removeAttribute("style");
  svg.setAttribute("width", String(size.width));
  svg.setAttribute("height", String(size.height));

  // the bar shows the view's zoom level and its buttons drive the view; the view first reports a change from the resize observer below, once the bar exists
  const view = createPanZoom(viewport, svg, size, (scale, overflowing) => bar.update(scale, overflowing));
  const bar = createBar(viewer, view);
  viewer.prepend(bar.element);

  sizeViewport(viewport, size);
  bindInput(viewer, viewport, view);

  // on a resize (window, rotation, fullscreen): resize the inline viewport to the new width, then put the view back unless the reader has moved it
  let lastWidth = viewport.clientWidth;
  let wasFullscreen = false;
  new ResizeObserver(() => {
    const fullscreen = document.fullscreenElement === viewer;
    if (!fullscreen && viewport.clientWidth !== lastWidth) {
      sizeViewport(viewport, size);
    }

    lastWidth = viewport.clientWidth;
    view.refresh(fullscreen !== wasFullscreen);
    wasFullscreen = fullscreen;
  }).observe(viewport);
}

// resolves once the viewer styles apply, so layout measurements in mountViewer are accurate
function loadStylesheet() {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    // resolved against this script, so it follows wherever the assets are served from
    link.href = new URL("./mermaid-viewer.css", import.meta.url).href;
    link.addEventListener("load", resolve);
    link.addEventListener("error", () => reject(new Error(`failed to load ${link.href}`)));
    document.head.append(link);
  });
}

/**
 * reads a custom property from style.css; a missing one fails, rather than letting mermaid fall back to its own look.
 * @param {string} name
 */
function siteProperty(name) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) {
    console.error(`[mermaid-viewer] the css custom property ${name} isn't set, so diagrams can't match the site; check style.css`); // eslint-disable-line no-console
    throw new TypeError(`missing css custom property ${name}`);
  }

  return value;
}

function siteThemeVariables() {
  const entries = Object.entries(THEME_PROPERTIES).map(([variable, property]) => [variable, siteProperty(property)]);
  return { ...Object.fromEntries(entries), fontSize: "16px" };
}

// mermaid sizes each box from its label as it renders, so the fonts must be loaded first or the text can overflow its box once they arrive
function loadLabelFonts() {
  return Promise.all(LABEL_FONTS.map((property) => document.fonts.load(`16px ${siteProperty(property)}`)));
}

async function renderDiagrams() {
  /** @type {HTMLPreElement[]} */
  const blocks = [...document.querySelectorAll("pre.mermaid")];
  if (blocks.length === 0) {
    return;
  }

  const [{ default: mermaid }] = await Promise.all([import(MERMAID_URL), loadStylesheet(), loadLabelFonts()]);
  // the classic look, since the default neo look adds gradient borders and drop shadows the site doesn't use anywhere else, and draws subgraph borders in the node colour
  const flowchart = { wrappingWidth: LABEL_WRAP_WIDTH, minNodeWidth: MIN_NODE_WIDTH };
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", look: "classic", theme: "base", themeVariables: siteThemeVariables(), flowchart });

  // render every diagram before failing, so one bad diagram doesn't hide the rest
  const failures = [];
  for (const [index, pre] of blocks.entries()) {
    const id = `mermaid-diagram-${index}`;
    try {
      const { svg } = await mermaid.render(id, pre.textContent ?? "");
      mountViewer(pre, svg, id);
    } catch (error) {
      pre.classList.add("mermaid--error");
      console.error(`[mermaid-viewer] diagram ${index + 1} failed to render; its source is left on the page`, error); // eslint-disable-line no-console
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, `${failures.length} of ${blocks.length} mermaid diagram(s) failed to render`);
  }
}

renderDiagrams();
