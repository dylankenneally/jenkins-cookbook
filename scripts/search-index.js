const path = require("node:path");

// folder inside the output that holds the search index and the pagefind ui
const BUNDLE_DIR = "pagefind";

async function buildSearchIndex(outputDir) {
  // pagefind is esm only, so it is loaded with a dynamic import from this commonjs file
  const pagefind = await import("pagefind");

  try {
    // includeCharacters keeps identifiers like BUILD_NUMBER searchable as a whole
    const { index } = await pagefind.createIndex({ forceLanguage: "en", includeCharacters: "_" });

    const crawl = await index.addDirectory({ path: outputDir });
    failOnErrors("index", crawl.errors);

    const write = await index.writeFiles({ outputPath: path.join(outputDir, BUNDLE_DIR) });
    failOnErrors("write", write.errors);

    console.log(`[search] indexed ${crawl.page_count} pages into ${path.join(outputDir, BUNDLE_DIR)}`);
  } finally {
    await pagefind.close();
  }
}

function failOnErrors(step, errors) {
  if (errors.length === 0) {
    return;
  }

  console.error(`[search] pagefind failed to ${step} the site:\n${errors.join("\n")}`);
  throw new Error(`pagefind failed to ${step} the site`);
}

module.exports = { buildSearchIndex };
