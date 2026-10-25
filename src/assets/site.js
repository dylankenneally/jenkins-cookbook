// accessibility fix applied on every page
// - code blocks that scroll sideways become keyboard focusable, so their overflow can be reached without a mouse

function updateScrollableBlock(block) {
  if (block.scrollWidth > block.clientWidth) {
     block.setAttribute("tabindex", "0");
  } else {
    block.removeAttribute("tabindex");
  }
}

// resize observation covers both the first layout and later window resizes
const blockObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    updateScrollableBlock(entry.target);
  }
});

for (const block of document.querySelectorAll("pre:not(.mermaid)")) {
  blockObserver.observe(block);
}
