// 404 page behaviour
//  - shows the address that wasn't found in the ingredients list
//  - without this script the list says "this address" instead

const target = document.querySelector("[data-requested-path]");

// opened directly as /404.html there is no missing address to show
if (target && !location.pathname.endsWith("/404.html")) {
  target.textContent = location.pathname;
}
