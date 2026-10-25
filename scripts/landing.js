const fs = require("node:fs");
const path = require("node:path");

// "guides/troubleshooting.md#section" -> "guides/troubleshooting.md"
function sourceFile(ref) {
  return ref.split("#")[0];
}

function collectPageRefs(landing) {
  const cardRefs = landing.cards.flatMap((card) => [...card.links.map((link) => link.page), card.more.page]);

  return [
    ...landing.track.map((step) => step.page),
    ...cardRefs,
    ...landing.matrix.blocks.map((block) => block.page),
    ...landing.matrix.pipelines.map((pipeline) => pipeline.page),
    ...landing.matrix.unused.map((block) => block.page)
  ];
}

// checks landing.json against the content folder, so a typo fails the build instead of shipping a dead link
function validateLanding(dataPath, contentDir) {
  const landing = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const problems = [];

  for (const ref of collectPageRefs(landing)) {
    if (!fs.existsSync(path.join(contentDir, sourceFile(ref)))) {
      problems.push(`page not found: ${ref}`);
    }
  }

  const blockNames = new Set(landing.matrix.blocks.map((block) => block.name));
  for (const pipeline of landing.matrix.pipelines) {
    for (const name of pipeline.blocks) {
      if (!blockNames.has(name)) {
        problems.push(`${pipeline.page} uses an unknown building block: ${name}`);
      }
    }
  }

  if (problems.length === 0) {
    return;
  }

  console.error(`[landing] ${dataPath} has problems:\n${problems.join("\n")}`);
  throw new Error(`${dataPath} references pages or building blocks that don't exist`);
}

// finds a built page from the source path used in landing.json
function pageFor(pages, ref, contentDir) {
  const [file, anchor] = ref.split("#");
  const inputPath = `./${contentDir}/${file}`;
  const page = pages.find((candidate) => candidate.inputPath === inputPath);

  if (!page) {
    console.error(`[landing] no built page for ${ref}`);
    throw new Error(`no built page for ${ref}`);
  }

  return { url: anchor ? `${page.url}#${anchor}` : page.url, title: page.data.docTitle };
}

module.exports = { validateLanding, pageFor };
