// adds a "Copy" button to every code block
// - each <pre> is wrapped in a div, so the button stays put while a wide block scrolls sideways
// - the copied text is the block's plain text, without the syntax highlighting markup
// - no buttons are added where the clipboard api is missing (it needs https or localhost)
// - mermaid diagrams are skipped, they are drawings rather than code

// how long the "Copied!" confirmation stays before the button resets
const RESET_MS = 2000;

// visible text and accessible name per state; the name always contains the text so voice control can say what it sees
const STATES = {
  idle: { text: "Copy", label: "Copy code" },
  done: { text: "Copied!", label: "Copied" },
  failed: { text: "Copy failed!", label: "Copy failed" }
};

function createStatusRegion() {
  const region = document.createElement("div");
  region.className = "visually-hidden";
  region.setAttribute("role", "status");
  document.body.append(region);
  return region;
}

function codeText(block) {
  return (block.textContent ?? "").replace(/\n+$/, "");
}

function addCopyButton(block, status) {
  const wrapper = document.createElement("div");
  wrapper.className = "code-block";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "code-copy";

  let resetTimer;

  function show(state) {
    button.textContent = STATES[state].text;
    button.setAttribute("aria-label", STATES[state].label);
    window.clearTimeout(resetTimer);
    if (state !== "idle") {
      status.textContent = STATES[state].label;
      resetTimer = window.setTimeout(() => show("idle"), RESET_MS);
    }
  }

  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(codeText(block));
      show("done");
    } catch (error) {
      console.error("[code-copy] couldn't write to the clipboard", error);
      show("failed");
    }
  });

  show("idle");
  block.before(wrapper);
  wrapper.append(button, block);
}

if (navigator.clipboard?.writeText) {
  const status = createStatusRegion();
  for (const block of document.querySelectorAll("pre:not(.mermaid)")) {
    if (block instanceof HTMLElement) {
      addCopyButton(block, status);
    }
  }
}
