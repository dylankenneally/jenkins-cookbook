// @ts-check
/*
 * Renders ```mermaid blocks (emitted as <pre class="mermaid">) into interactive diagrams.
 *  - mermaid is only fetched when the page actually has a diagram
 *  - each diagram gets a toolbar: zoom in/out, fit, actual size, fullscreen
 *  - drag to pan, ctrl/cmd + wheel or trackpad pinch to zoom (plain wheel zooms in fullscreen), two-finger pinch on touch
 *  - keyboard on a focused diagram: + / - zoom, 0 fit, 1 actual size, arrows pan, f fullscreen
 */

// pinned so a mermaid release can't silently change rendering; bump deliberately
const MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.esm.min.mjs";

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.25;
const PAN_STEP = 60;

// cap the inline viewport so a tall diagram doesn't swallow the page
const MAX_VIEWPORT_HEIGHT_RATIO = 0.75;

/**
 * pan/zoom state for one diagram, applied as a css transform on the svg.
 * @param {HTMLElement} viewport the clipping element that receives input
 * @param {SVGSVGElement} svg the rendered diagram
 * @param {{ width: number, height: number }} size the diagram's natural size in css pixels
 */
function createPanZoom(viewport, svg, size) {
  let scale = 1;
  let x = 0;
  let y = 0;

  function apply() {
    svg.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }

  // zoom about a point in viewport coordinates so the content under it stays put
  function zoomAt(factor, px, py) {
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
  function fit() {
    centreAt(Math.min(1, viewport.clientWidth / size.width, viewport.clientHeight / size.height));
  }

  function actualSize() {
    centreAt(1);
  }

  return { zoomAt, zoomCentre, panBy, fit, actualSize };
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
      view.panBy(current.x - previous.x, current.y - previous.y);
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
    ArrowDown: () => view.panBy(0, -PAN_STEP),
    f: () => toggleFullscreen(viewer)
  };

  viewport.addEventListener("keydown", (event) => {
    const action = keys[event.key];
    if (!action || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    event.preventDefault();
    action();
  });
}

function toggleFullscreen(viewer) {
  if (document.fullscreenElement === viewer) {
    document.exitFullscreen();
    return;
  }

  viewer.requestFullscreen();
}

/**
 * builds a toolbar button.
 * @param {string} label accessible name and tooltip
 * @param {string} text visible glyph
 * @param {() => void} onClick
 */
function toolbarButton(label, text, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mermaid-viewer__button";
  button.textContent = text;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onClick);
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
 * replaces a <pre class="mermaid"> with the rendered, interactive diagram.
 * @param {HTMLPreElement} pre
 * @param {string} svgMarkup
 */
function mountViewer(pre, svgMarkup) {
  const viewer = document.createElement("figure");
  viewer.className = "mermaid-viewer";

  const viewport = document.createElement("div");
  viewport.className = "mermaid-viewer__viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("role", "group");
  viewport.setAttribute("aria-label", "Diagram. Drag or use arrow keys to pan, plus and minus to zoom, 0 to fit, F for fullscreen.");
  viewport.innerHTML = svgMarkup;

  const svg = viewport.querySelector("svg");
  if (!svg) {
    console.error("[mermaid-viewer] mermaid returned markup with no <svg> element"); // eslint-disable-line no-console
    throw new TypeError("mermaid render produced no svg");
  }

  viewer.append(viewport);
  pre.replaceWith(viewer);

  // pin the svg to its natural size so the transform is the only thing scaling it
  const size = naturalSize(svg);
  svg.removeAttribute("style");
  svg.setAttribute("width", String(size.width));
  svg.setAttribute("height", String(size.height));

  // inline height: the diagram at width-fit, capped so it doesn't dominate the page
  const widthFit = Math.min(1, viewport.clientWidth / size.width);
  viewport.style.height = `${Math.ceil(Math.min(size.height * widthFit, window.innerHeight * MAX_VIEWPORT_HEIGHT_RATIO)) + 2}px`;

  const view = createPanZoom(viewport, svg, size);

  const toolbar = document.createElement("div");
  toolbar.className = "mermaid-viewer__toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Diagram controls");
  toolbar.append(
    toolbarButton("Zoom in", "+", () => view.zoomCentre(ZOOM_STEP)),
    toolbarButton("Zoom out", "\u2212", () => view.zoomCentre(1 / ZOOM_STEP)),
    toolbarButton("Fit to view", "\u2922", () => view.fit()),
    toolbarButton("Actual size 1:1", "1:1", () => view.actualSize()),
    toolbarButton("Toggle fullscreen", "\u26F6", () => toggleFullscreen(viewer))
  );
  viewer.prepend(toolbar);

  bindInput(viewer, viewport, view);

  // refit whenever the available space changes (window resize, entering or leaving fullscreen)
  new ResizeObserver(() => view.fit()).observe(viewport);
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

async function renderDiagrams() {
  /** @type {HTMLPreElement[]} */
  const blocks = [...document.querySelectorAll("pre.mermaid")];
  if (blocks.length === 0) {
    return;
  }

  const [{ default: mermaid }] = await Promise.all([import(MERMAID_URL), loadStylesheet()]);
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });

  // render every diagram before failing, so one bad diagram doesn't hide the rest
  const failures = [];
  for (const [index, pre] of blocks.entries()) {
    try {
      const { svg } = await mermaid.render(`mermaid-diagram-${index}`, pre.textContent ?? "");
      mountViewer(pre, svg);
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
