// landing page behaviour
//  - the building block matrix highlights the row and column under the pointer or keyboard focus
//  - without this script the matrix still works, it just highlights the row on hover (css only)

const matrix = document.querySelector(".matrix");

if (matrix) {
  const cells = [...matrix.querySelectorAll("[data-row], [data-col]")].filter((element) => element instanceof HTMLElement);

  // a body cell carries both a row and a column, a header carries only one of them
  function highlight(target) {
    const origin = target instanceof Element ? target.closest("[data-row], [data-col]") : null;
    if (!(origin instanceof HTMLElement)) {
      return;
    }

    const { row, col } = origin.dataset;
    for (const cell of cells) {
      const sameRow = row !== undefined && cell.dataset.row === row;
      const sameCol = col !== undefined && cell.dataset.col === col;
      cell.classList.toggle("is-active", sameRow || sameCol);
    }

    origin.classList.add("is-origin");
  }

  function clear() {
    for (const cell of cells) {
      cell.classList.remove("is-active", "is-origin");
    }
  }

  matrix.addEventListener("pointerover", (event) => {
    clear();
    highlight(event.target);
  });
  matrix.addEventListener("pointerleave", clear);
  matrix.addEventListener("focusin", (event) => {
    clear();
    highlight(event.target);
  });
  matrix.addEventListener("focusout", clear);
}
