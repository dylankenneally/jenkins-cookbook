// shared by the breadcrumb and tag code: where a page sits under the content folder

const path = require("node:path");

// "./src/content/guides/flaky-tests.md" -> "guides/flaky-tests.md"
function relativeToContent(inputPath, contentDir) {
  return path.posix.relative(contentDir, inputPath.replace(/^\.\//, ""));
}

// the page's folder under the content dir ("guides"), or "" for a page at the top
function folderOf(relative) {
  return relative.includes("/") ? relative.split("/")[0] : "";
}

module.exports = { relativeToContent, folderOf };
